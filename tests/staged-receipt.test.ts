import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { captureStagedSnapshot } from "../src/git.js";
import {
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
import { createStagedReviewReceipt } from "../src/staged/receipt.js";
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

  assert.strictEqual(inspected.receipt.review?.card_status, "complete");
  assert.deepStrictEqual(inspected.receipt.review?.session_counts, {
    prompts_presented: 1,
    predictions_completed: 1,
    skips: 0,
  });
  assert.strictEqual(inspected.receipt.review?.entity.source_check?.status, "source_derived_match");

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
