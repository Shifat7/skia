import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { TOOL_VERSION } from "../src/limits.js";
import type { Sha256Hex, StagedReceipt } from "../src/types.js";
import { captureStagedSnapshot } from "../src/git.js";
import {
  deriveStagedArtifactPath,
  deriveStagedReceiptPath,
  validateSessionId,
} from "../src/paths.js";
import { validateStagedReceipt } from "../src/schema.js";
import {
  abortStagedRun,
  allocateStagedRun,
  completeStagedRun,
  deleteRun,
  inspectRun,
  listRuns,
  setStorageTestHooks,
  writeStagedArtifactFile,
} from "../src/storage.js";
import { createPredictionSession } from "../src/staged/card.js";
import { analyzeCapturedStagedSnapshot } from "../src/staged/pipeline.js";
import {
  createSkippedStagedReviewReceipt,
  createStagedReviewReceipt,
} from "../src/staged/receipt.js";
import {
  commitAll,
  createTempGitRepository,
  stagePaths,
  writeRepoTextFile,
} from "./git-test-helpers.js";

function createSupportedRepository(): string {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") {',
      '    return "ok";',
      "  }",
      "",
      '  return "hold";',
      "}",
      "",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  return repositoryRoot;
}

function receiptWithSelfHash(receipt: StagedReceipt): StagedReceipt {
  const withoutSelf = {
    ...receipt,
    artifact_hashes: receipt.artifact_hashes.filter(
      (artifact) => artifact.kind !== "receipt",
    ),
  };
  const sha256 = createHash("sha256")
    .update(`${JSON.stringify(withoutSelf, null, 2)}\n`)
    .digest("hex") as Sha256Hex;

  return {
    ...withoutSelf,
    artifact_hashes: [
      ...withoutSelf.artifact_hashes,
      {
        kind: "receipt",
        path: deriveStagedReceiptPath(withoutSelf.run_id, withoutSelf.session_id),
        sha256,
      },
    ],
  };
}

function preparedMismatchReceipt(): {
  readonly allocation: ReturnType<typeof allocateStagedRun>;
  readonly receipt: StagedReceipt;
  readonly repositoryRoot: string;
} {
  const repositoryRoot = createSupportedRepository();
  const pipeline = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );
  assert.strictEqual(pipeline.kind, "supported");
  if (pipeline.kind !== "supported") {
    throw new Error("expected a supported staged snapshot");
  }

  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
    pipeline.snapshot,
    pipeline.coverage,
  );
  const session = createPredictionSession(pipeline.analysis);
  let cardArtifact: ReturnType<typeof writeStagedArtifactFile> | undefined;
  const sealed = session.persistPrediction(
    { kind: "return_value", value: "hold" },
    (record) => {
      cardArtifact = writeStagedArtifactFile(
        allocation,
        "behavior_cards",
        `${JSON.stringify(record, null, 2)}\n`,
      );
    },
    new Date("2026-09-22T01:02:04Z"),
  );
  if (cardArtifact === undefined) {
    throw new Error("expected behavior-card artifact");
  }

  return {
    allocation,
    repositoryRoot,
    receipt: createStagedReviewReceipt({
      allocation,
      analysis: pipeline.analysis,
      behavior_card_artifact: cardArtifact,
      completed_at: new Date("2026-09-22T01:02:05Z"),
      coverage: pipeline.coverage,
      sealed_prediction: sealed,
      snapshot: pipeline.snapshot,
      source_check: session.sourceCheck(),
    }),
  };
}

test("staged run persists prediction artifact before completing validated receipt", () => {
  const repositoryRoot = createSupportedRepository();
  const pipeline = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );
  assert.strictEqual(pipeline.kind, "supported");
  if (pipeline.kind !== "supported") {
    return;
  }

  const sessionId = validateSessionId("8f5d1a2c");
  const allocation = allocateStagedRun(
    repositoryRoot,
    sessionId,
    new Date("2026-09-22T01:02:03Z"),
    pipeline.snapshot,
    pipeline.coverage,
  );
  const session = createPredictionSession(pipeline.analysis);
  const cardArtifacts: ReturnType<typeof writeStagedArtifactFile>[] = [];

  const sealed = session.persistPrediction(
    { kind: "return_value", value: "ok" },
    (record) => {
      cardArtifacts.push(
        writeStagedArtifactFile(
          allocation,
          "behavior_cards",
          `${JSON.stringify(record, null, 2)}\n`,
        ),
      );
    },
    new Date("2026-09-22T01:02:04Z"),
  );

  const cardArtifact = cardArtifacts[0];
  if (cardArtifact === undefined) {
    throw new Error("expected behavior-card artifact");
  }
  assert.strictEqual(fs.existsSync(cardArtifact.absolutePath), true);

  const sourceCheck = session.sourceCheck();
  const receipt = createStagedReviewReceipt({
    allocation,
    analysis: pipeline.analysis,
    behavior_card_artifact: cardArtifact,
    completed_at: new Date("2026-09-22T01:02:05Z"),
    coverage: pipeline.coverage,
    sealed_prediction: sealed,
    snapshot: pipeline.snapshot,
    source_check: sourceCheck,
  });
  const completed = completeStagedRun(allocation, receipt);

  assert.strictEqual(fs.existsSync(completed.receiptPath), true);
  const inspected = inspectRun(repositoryRoot, allocation.runId);
  assert.strictEqual(inspected.kind, "review");
  if (inspected.kind !== "review") {
    return;
  }

  const packageVersion = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"),
      "utf8",
    ),
  ) as { readonly version: string };
  assert.strictEqual(inspected.receipt.tool_version, TOOL_VERSION);
  assert.strictEqual(inspected.receipt.tool_version, packageVersion.version);
  assert.deepStrictEqual(inspected.receipt.review, {
    card_status: "complete",
    session_counts: {
      prompts_presented: 1,
      predictions_completed: 1,
      skips: 0,
    },
  });
  const persisted = JSON.parse(fs.readFileSync(completed.receiptPath, "utf8")) as {
    readonly review: {
      readonly entity: {
        readonly source_check: { readonly status: string };
      };
    };
  };
  assert.strictEqual(
    persisted.review.entity.source_check.status,
    "source_derived_match",
  );

  const missingPrediction = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      entity: {
        prediction: unknown;
      };
    };
  };
  missingPrediction.review.entity.prediction = null;
  assert.strictEqual(validateStagedReceipt(missingPrediction).valid, false);

  const contradictoryCheck = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      entity: {
        source_check: {
          predicted: unknown;
        } | null;
      };
    };
  };
  if (contradictoryCheck.review.entity.source_check === null) {
    throw new Error("expected source check");
  }
  contradictoryCheck.review.entity.source_check.predicted = "different";
  assert.strictEqual(validateStagedReceipt(contradictoryCheck).valid, false);

  const extraPrompt = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      session_counts: {
        prompts_presented: number;
      };
    };
  };
  extraPrompt.review.session_counts.prompts_presented = 2;
  const extraPromptValidation = validateStagedReceipt(extraPrompt);
  assert.strictEqual(extraPromptValidation.valid, false);
  if (!extraPromptValidation.valid) {
    assert.match(
      extraPromptValidation.errors.map((error) => error.message).join("\n"),
      /one presented prompt/,
    );
  }

  const extraSkippedPrompt = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      card_status: string;
      session_counts: {
        prompts_presented: number;
        predictions_completed: number;
        skips: number;
      };
      entity: {
        prediction: unknown;
        source_check: unknown;
      };
    };
  };
  extraSkippedPrompt.review.card_status = "skipped";
  extraSkippedPrompt.review.session_counts = {
    prompts_presented: 2,
    predictions_completed: 0,
    skips: 1,
  };
  extraSkippedPrompt.review.entity.prediction = null;
  extraSkippedPrompt.review.entity.source_check = null;
  const extraSkippedValidation = validateStagedReceipt(extraSkippedPrompt);
  assert.strictEqual(extraSkippedValidation.valid, false);
  if (!extraSkippedValidation.valid) {
    assert.match(
      extraSkippedValidation.errors.map((error) => error.message).join("\n"),
      /one presented prompt/,
    );
  }

  const impossibleSeal = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      entity: {
        prediction: {
          sealed_at: string;
        };
      };
    };
  };
  const missingClaim = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      entity: {
        evidence: {
          claim_state?: string;
        };
      };
    };
  };
  delete missingClaim.review.entity.evidence.claim_state;
  assert.strictEqual(validateStagedReceipt(missingClaim).valid, false);

  const reversedAnchor = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      entity: {
        anchor: {
          start_line: number;
          end_line: number;
        };
      };
    };
  };
  const anchorStart = reversedAnchor.review.entity.anchor.start_line;
  reversedAnchor.review.entity.anchor.start_line =
    reversedAnchor.review.entity.anchor.end_line + 4;
  reversedAnchor.review.entity.anchor.end_line = anchorStart;
  const reversedAnchorValidation = validateStagedReceipt(reversedAnchor);
  assert.strictEqual(reversedAnchorValidation.valid, false);
  if (!reversedAnchorValidation.valid) {
    assert.match(
      reversedAnchorValidation.errors.map((error) => error.message).join("\n"),
      /end_line must not be before start_line/,
    );
  }

  const relabeledExpectation = JSON.parse(JSON.stringify(receipt)) as {
    review: {
      entity: {
        source_check: {
          expected: unknown;
          status: string;
        };
      };
    };
  };
  relabeledExpectation.review.entity.source_check.expected = "different";
  relabeledExpectation.review.entity.source_check.status = "source_derived_match";
  const relabeledValidation = validateStagedReceipt(relabeledExpectation);
  assert.strictEqual(relabeledValidation.valid, false);
  if (!relabeledValidation.valid) {
    assert.match(
      relabeledValidation.errors.map((error) => error.message).join("\n"),
      /deterministic evidence relation/,
    );
  }

  impossibleSeal.review.entity.prediction.sealed_at = "2026-99-99T99:99:99Z";
  const impossibleSealValidation = validateStagedReceipt(impossibleSeal);
  assert.strictEqual(impossibleSealValidation.valid, false);
  if (!impossibleSealValidation.valid) {
    assert.match(
      impossibleSealValidation.errors.map((error) => error.message).join("\n"),
      /real UTC calendar timestamp/,
    );
  }
});

test("skipped behavior cards reject impossible sealed_at timestamps", () => {
  const repositoryRoot = createSupportedRepository();
  const pipeline = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );
  assert.strictEqual(pipeline.kind, "supported");
  if (pipeline.kind !== "supported") {
    return;
  }

  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
    pipeline.snapshot,
    pipeline.coverage,
  );
  const artifact = writeStagedArtifactFile(
    allocation,
    "behavior_cards",
    `${JSON.stringify({
      action: "skip",
      scenario: pipeline.analysis.scenario,
      sealed_at: "2026-99-99T99:99:99Z",
    })}\n`,
  );
  const receipt = createSkippedStagedReviewReceipt({
    allocation,
    analysis: pipeline.analysis,
    behavior_card_artifact: artifact,
    completed_at: new Date("2026-09-22T01:02:05Z"),
    coverage: pipeline.coverage,
    snapshot: pipeline.snapshot,
  });

  assert.throws(
    () => completeStagedRun(allocation, receipt),
    /does not match the persisted skip/,
  );
});

test("staged run allocation resolves collisions before any interaction", () => {
  const repositoryRoot = createSupportedRepository();
  const sessionId = validateSessionId("8f5d1a2c");
  const instant = new Date("2026-09-22T01:02:03Z");
  const first = allocateStagedRun(repositoryRoot, sessionId, instant);
  const second = allocateStagedRun(
    repositoryRoot,
    validateSessionId("9f6e2b3d"),
    instant,
  );

  assert.strictEqual(first.runId, "20260922T010203Z");
  assert.strictEqual(second.runId, "20260922T010203Z-01");
  assert.deepStrictEqual(
    listRuns(repositoryRoot).map((run) => ({
      mode: run.mode,
      run_id: run.run_id,
      status: run.status,
    })),
    [
      {
        mode: "review",
        run_id: "20260922T010203Z",
        status: "incomplete",
      },
      {
        mode: "review",
        run_id: "20260922T010203Z-01",
        status: "incomplete",
      },
    ],
  );
});

test("a failed artifact write removes the file it just created", () => {
  const repositoryRoot = createSupportedRepository();
  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
  );
  const absolutePath = path.join(
    allocation.skiaRootPath,
    deriveStagedArtifactPath(
      allocation.runId,
      allocation.sessionId,
      "behavior_cards",
    ),
  );
  setStorageTestHooks({
    afterCreateNewFile: () => {
      throw new Error("ENOSPC");
    },
  });

  try {
    assert.throws(
      () => writeStagedArtifactFile(allocation, "behavior_cards", "{}\n"),
      /ENOSPC/,
    );
  } finally {
    setStorageTestHooks(null);
  }

  assert.strictEqual(fs.existsSync(absolutePath), false);
  abortStagedRun(allocation);
});

test("completing a staged run rejects a receipt whose expected return was rewritten to the prediction", () => {
  const prepared = preparedMismatchReceipt();
  const forged = JSON.parse(JSON.stringify(prepared.receipt)) as {
    review: {
      entity: {
        evidence: { relation: string };
        scenario: { given: { parameter: string; value: unknown } };
        source_check: { expected: unknown; predicted: unknown; status: string };
      };
    };
  };
  forged.review.entity.source_check.expected =
    forged.review.entity.source_check.predicted;
  forged.review.entity.source_check.status = "source_derived_match";
  forged.review.entity.evidence.relation =
    `${forged.review.entity.scenario.given.parameter} === ` +
    `${JSON.stringify(forged.review.entity.scenario.given.value)} -> return ` +
    `${JSON.stringify(forged.review.entity.source_check.expected)}`;
  const rewritten = receiptWithSelfHash(forged as StagedReceipt);
  const receiptPath = path.join(
    prepared.allocation.skiaRootPath,
    deriveStagedReceiptPath(prepared.allocation.runId, prepared.allocation.sessionId),
  );

  assert.strictEqual(validateStagedReceipt(rewritten).valid, true);
  assert.throws(
    () => completeStagedRun(prepared.allocation, rewritten),
    /staged snapshot source/,
  );
  assert.strictEqual(fs.existsSync(receiptPath), false);
});

test("completing a staged run rejects an incomplete receipt", () => {
  const prepared = preparedMismatchReceipt();
  const incomplete = receiptWithSelfHash({
    ...JSON.parse(JSON.stringify(prepared.receipt)) as StagedReceipt,
    status: "incomplete",
    completed_at: null,
  });
  const receiptPath = path.join(
    prepared.allocation.skiaRootPath,
    deriveStagedReceiptPath(prepared.allocation.runId, prepared.allocation.sessionId),
  );

  assert.throws(
    () => completeStagedRun(prepared.allocation, incomplete),
    /complete receipt/,
  );
  assert.strictEqual(fs.existsSync(receiptPath), false);
  assert.strictEqual(listRuns(prepared.repositoryRoot)[0]?.status, "incomplete");
});

test("completing a staged run rejects a rewritten scenario even when the expected return still matches", () => {
  const prepared = preparedMismatchReceipt();
  const forged = JSON.parse(JSON.stringify(prepared.receipt)) as {
    artifact_hashes: { kind: string; sha256: string }[];
    review: {
      entity: {
        prediction: { scenario: { when: string } };
        scenario: { when: string };
      };
    };
  };
  forged.review.entity.scenario.when = "forged invocation";
  forged.review.entity.prediction.scenario.when = "forged invocation";
  const cardPath = path.join(
    prepared.allocation.skiaRootPath,
    deriveStagedArtifactPath(
      prepared.allocation.runId,
      prepared.allocation.sessionId,
      "behavior_cards",
    ),
  );
  const cardBytes = `${JSON.stringify(forged.review.entity.prediction, null, 2)}\n`;
  fs.writeFileSync(cardPath, cardBytes);
  const cardHash = createHash("sha256").update(cardBytes).digest("hex");
  const behaviorCard = forged.artifact_hashes.find(
    (artifact) => artifact.kind === "behavior_cards",
  );
  if (behaviorCard === undefined) {
    throw new Error("expected behavior-card hash");
  }
  behaviorCard.sha256 = cardHash;
  const rewritten = receiptWithSelfHash(forged as unknown as StagedReceipt);

  assert.strictEqual(validateStagedReceipt(rewritten).valid, true);
  assert.throws(
    () => completeStagedRun(prepared.allocation, rewritten),
    /staged snapshot source/,
  );
});

test("completing a skipped staged run rejects rewritten deterministic evidence", () => {
  const repositoryRoot = createSupportedRepository();
  const pipeline = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );
  assert.strictEqual(pipeline.kind, "supported");
  if (pipeline.kind !== "supported") {
    return;
  }

  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
    pipeline.snapshot,
    pipeline.coverage,
  );
  const artifact = writeStagedArtifactFile(
    allocation,
    "behavior_cards",
    `${JSON.stringify({
      action: "skip",
      scenario: pipeline.analysis.scenario,
      sealed_at: "2026-09-22T01:02:04Z",
    })}\n`,
  );
  const receipt = createSkippedStagedReviewReceipt({
    allocation,
    analysis: pipeline.analysis,
    behavior_card_artifact: artifact,
    completed_at: new Date("2026-09-22T01:02:05Z"),
    coverage: pipeline.coverage,
    snapshot: pipeline.snapshot,
  });
  const forged = JSON.parse(JSON.stringify(receipt)) as {
    artifact_hashes: { kind: string; sha256: string }[];
    review: {
      entity: {
        evidence: { relation: string };
        scenario: { when: string };
      };
    };
  };
  forged.review.entity.scenario.when = "forged invocation";
  forged.review.entity.evidence.relation = "forged relation";
  const cardBytes = `${JSON.stringify({
    action: "skip",
    scenario: forged.review.entity.scenario,
    sealed_at: "2026-09-22T01:02:04Z",
  })}\n`;
  fs.writeFileSync(artifact.absolutePath, cardBytes);
  const behaviorCard = forged.artifact_hashes.find(
    (candidate) => candidate.kind === "behavior_cards",
  );
  if (behaviorCard === undefined) {
    throw new Error("expected behavior-card hash");
  }
  behaviorCard.sha256 = createHash("sha256").update(cardBytes).digest("hex");
  const rewritten = receiptWithSelfHash(forged as unknown as StagedReceipt);

  assert.strictEqual(validateStagedReceipt(rewritten).valid, true);
  assert.throws(
    () => completeStagedRun(allocation, rewritten),
    /staged snapshot source/,
  );
});

test("completing a staged run rejects a receipt without pilot review details", () => {
  const prepared = preparedMismatchReceipt();
  const { review: _review, ...withoutReview } = JSON.parse(
    JSON.stringify(prepared.receipt),
  ) as StagedReceipt;
  const rewritten = receiptWithSelfHash(withoutReview);

  assert.strictEqual(validateStagedReceipt(rewritten).valid, true);
  assert.throws(
    () => completeStagedRun(prepared.allocation, rewritten),
    /pilot review details/,
  );
});

test("completing a staged run rejects coverage that differs from allocation", () => {
  const prepared = preparedMismatchReceipt();
  const forged = JSON.parse(JSON.stringify(prepared.receipt)) as {
    coverage: {
      summary: {
        total_units: number;
        supported_units: number;
        partial_units: number;
        unmapped_units: number;
        unsupported_units: number;
        excluded_units: number;
        failed_units: number;
        unchecked_units: number;
      };
      events: unknown[];
    };
  };
  forged.coverage.events = [];
  forged.coverage.summary.total_units = 0;
  forged.coverage.summary.supported_units = 0;
  forged.coverage.summary.partial_units = 0;
  forged.coverage.summary.unmapped_units = 0;
  forged.coverage.summary.unsupported_units = 0;
  forged.coverage.summary.excluded_units = 0;
  forged.coverage.summary.failed_units = 0;
  forged.coverage.summary.unchecked_units = 0;
  const rewritten = receiptWithSelfHash(forged as unknown as StagedReceipt);

  assert.strictEqual(validateStagedReceipt(rewritten).valid, true);
  assert.throws(
    () => completeStagedRun(prepared.allocation, rewritten),
    /allocated coverage/,
  );
});

test("completing a staged run rejects a receipt snapshot that differs from allocation", () => {
  const prepared = preparedMismatchReceipt();
  const forged = JSON.parse(JSON.stringify(prepared.receipt)) as {
    snapshot: { diff_sha256: string };
  };
  forged.snapshot.diff_sha256 = "a".repeat(64);
  const rewritten = receiptWithSelfHash(forged as unknown as StagedReceipt);

  assert.strictEqual(validateStagedReceipt(rewritten).valid, true);
  assert.throws(
    () => completeStagedRun(prepared.allocation, rewritten),
    /allocated snapshot/,
  );
});

test("aborting a staged run leaves an artifact it did not create", () => {
  const repositoryRoot = createSupportedRepository();
  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
  );
  const absolutePath = path.join(
    allocation.skiaRootPath,
    deriveStagedArtifactPath(
      allocation.runId,
      allocation.sessionId,
      "behavior_cards",
    ),
  );
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, "orphan\n");

  let thrown: unknown;
  try {
    writeStagedArtifactFile(allocation, "behavior_cards", "{}\n");
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error);
  assert.strictEqual(
    (thrown as { readonly code?: string }).code,
    "EEXIST",
  );
  abortStagedRun(allocation);
  assert.strictEqual(fs.readFileSync(absolutePath, "utf8"), "orphan\n");
});

test("aborting a staged run removes its artifacts and run-id claim", () => {
  const repositoryRoot = createSupportedRepository();
  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
  );
  const artifact = writeStagedArtifactFile(
    allocation,
    "behavior_cards",
    "{}\n",
  );

  abortStagedRun(allocation);

  assert.strictEqual(fs.existsSync(artifact.absolutePath), false);
  assert.deepStrictEqual(
    fs.readdirSync(`${repositoryRoot}/.skia/run-ids`),
    [],
  );
});

test("deleting an incomplete staged run removes artifacts before its claim", () => {
  const repositoryRoot = createSupportedRepository();
  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
  );
  const artifact = writeStagedArtifactFile(
    allocation,
    "behavior_cards",
    "{}\n",
  );

  assert.deepStrictEqual(deleteRun(repositoryRoot, allocation.runId), {
    deleted: true,
    remaining_paths: [],
  });
  assert.strictEqual(fs.existsSync(artifact.absolutePath), false);
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});

test("staged completion rejects a behavior-card artifact that differs from the receipt", () => {
  const repositoryRoot = createSupportedRepository();
  const pipeline = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );
  assert.strictEqual(pipeline.kind, "supported");
  if (pipeline.kind !== "supported") {
    return;
  }
  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
    pipeline.snapshot,
    pipeline.coverage,
  );
  const session = createPredictionSession(pipeline.analysis);
  const sealed = session.persistPrediction(
    { kind: "return_value", value: "ok" },
    () => undefined,
    new Date("2026-09-22T01:02:04Z"),
  );
  const artifact = writeStagedArtifactFile(
    allocation,
    "behavior_cards",
    `${JSON.stringify({
      ...sealed,
      prediction: { kind: "return_value", value: "different" },
    }, null, 2)}\n`,
  );
  const receipt = createStagedReviewReceipt({
    allocation,
    analysis: pipeline.analysis,
    behavior_card_artifact: artifact,
    completed_at: new Date("2026-09-22T01:02:05Z"),
    coverage: pipeline.coverage,
    sealed_prediction: sealed,
    snapshot: pipeline.snapshot,
    source_check: session.sourceCheck(),
  });

  assert.throws(
    () => completeStagedRun(allocation, receipt),
    /behavior-card artifact.*persisted prediction/i,
  );
});

test("staged receipt publication keeps the canonical path absent until atomic publish", () => {
  const repositoryRoot = createSupportedRepository();
  const pipeline = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );
  assert.strictEqual(pipeline.kind, "supported");
  if (pipeline.kind !== "supported") {
    return;
  }
  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
    pipeline.snapshot,
    pipeline.coverage,
  );
  const session = createPredictionSession(pipeline.analysis);
  const artifacts: ReturnType<typeof writeStagedArtifactFile>[] = [];
  const sealed = session.persistPrediction(
    { kind: "return_value", value: "ok" },
    (record) => {
      artifacts.push(
        writeStagedArtifactFile(
          allocation,
          "behavior_cards",
          `${JSON.stringify(record, null, 2)}\n`,
        ),
      );
    },
    new Date("2026-09-22T01:02:04Z"),
  );
  const artifact = artifacts[0];
  if (artifact === undefined) {
    throw new Error("expected behavior-card artifact");
  }
  const receipt = createStagedReviewReceipt({
    allocation,
    analysis: pipeline.analysis,
    behavior_card_artifact: artifact,
    completed_at: new Date("2026-09-22T01:02:05Z"),
    coverage: pipeline.coverage,
    sealed_prediction: sealed,
    snapshot: pipeline.snapshot,
    source_check: session.sourceCheck(),
  });
  let temporaryPath = "";
  let canonicalPath = "";
  setStorageTestHooks({
    beforeStagedReceiptPublish: (paths) => {
      temporaryPath = paths.temporaryPath;
      canonicalPath = paths.receiptPath;
      assert.strictEqual(fs.existsSync(temporaryPath), true);
      assert.strictEqual(fs.existsSync(canonicalPath), false);
      throw new Error("simulated interruption");
    },
  });

  try {
    assert.throws(
      () => completeStagedRun(allocation, receipt),
      /simulated interruption/,
    );
  } finally {
    setStorageTestHooks(null);
  }

  assert.strictEqual(fs.existsSync(temporaryPath), false);
  assert.strictEqual(fs.existsSync(canonicalPath), false);
  assert.strictEqual(
    canonicalPath.endsWith(deriveStagedReceiptPath(
      allocation.runId,
      allocation.sessionId,
    )),
    true,
  );
});

test("deleting a completed run removes interrupted receipt hard-link temporaries", () => {
  const repositoryRoot = createSupportedRepository();
  const pipeline = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );
  assert.strictEqual(pipeline.kind, "supported");
  if (pipeline.kind !== "supported") {
    return;
  }
  const allocation = allocateStagedRun(
    repositoryRoot,
    validateSessionId("8f5d1a2c"),
    new Date("2026-09-22T01:02:03Z"),
    pipeline.snapshot,
    pipeline.coverage,
  );
  const session = createPredictionSession(pipeline.analysis);
  const artifacts: ReturnType<typeof writeStagedArtifactFile>[] = [];
  const sealed = session.persistPrediction(
    { kind: "return_value", value: "ok" },
    (record) => {
      artifacts.push(
        writeStagedArtifactFile(
          allocation,
          "behavior_cards",
          `${JSON.stringify(record, null, 2)}\n`,
        ),
      );
    },
  );
  const artifact = artifacts[0];
  if (artifact === undefined) {
    throw new Error("expected behavior-card artifact");
  }
  const receipt = createStagedReviewReceipt({
    allocation,
    analysis: pipeline.analysis,
    behavior_card_artifact: artifact,
    completed_at: new Date("2026-09-22T01:02:05Z"),
    coverage: pipeline.coverage,
    sealed_prediction: sealed,
    snapshot: pipeline.snapshot,
    source_check: session.sourceCheck(),
  });
  const completed = completeStagedRun(allocation, receipt);
  const receiptName = completed.receiptPath.split("/").at(-1);
  if (receiptName === undefined) {
    throw new Error("expected receipt filename");
  }
  const temporaryPath = path.join(
    completed.receiptPath.slice(0, -(receiptName.length + 1)),
    `.${receiptName}.tmp-12345-1`,
  );
  fs.linkSync(completed.receiptPath, temporaryPath);

  assert.deepStrictEqual(deleteRun(repositoryRoot, allocation.runId), {
    deleted: true,
    remaining_paths: [],
  });
  assert.strictEqual(fs.existsSync(temporaryPath), false);
});
