import { Buffer } from "node:buffer";
import path from "node:path";
import process from "node:process";

import { captureStagedSnapshot } from "../git.js";
import { MAX_TERMINAL_INPUT_BYTES } from "../limits.js";
import { validateSessionId } from "../paths.js";
import {
  abortStagedRun,
  allocateStagedRun,
  completeStagedRun,
  writeStagedArtifactFile,
} from "../storage.js";
import type { StagedRunAllocation } from "../storage.js";
import { formatRfc3339UtcSeconds } from "../time.js";
import type { JsonScalar } from "../types.js";
import { createPredictionSession } from "./card.js";
import { jsonScalarFromUnknown } from "./json-scalar.js";
import { analyzeCapturedStagedSnapshot } from "./pipeline.js";
import {
  createSkippedStagedReviewReceipt,
  createStagedReviewReceipt,
} from "./receipt.js";

export interface StagedReviewRunOptions {
  readonly input?: string;
  readonly now?: () => Date;
  readonly read_input?: (prompt: string) => string;
  readonly repository_root?: string;
  readonly session_id?: string;
}

export interface StagedReviewRunResult {
  readonly exit_code: number;
  readonly kind:
    | "review_complete"
    | "review_skipped"
    | "review_unsupported"
    | "review_failed"
    | "invalid_prediction";
  readonly output: string;
}

type ParsedPrediction =
  | { readonly kind: "prediction"; readonly value: JsonScalar }
  | { readonly kind: "skip" }
  | { readonly kind: "invalid"; readonly reason: "format" | "limit" };

function parsePrediction(input: string): ParsedPrediction {
  if (Buffer.from(input, "utf8").byteLength > MAX_TERMINAL_INPUT_BYTES) {
    return { kind: "invalid", reason: "limit" };
  }

  const value = input.split(/\r?\n/, 1)[0]?.trim() ?? "";

  if (value === "skip") {
    return { kind: "skip" };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    const scalar = jsonScalarFromUnknown(parsed);
    return scalar === undefined
      ? { kind: "invalid", reason: "format" }
      : { kind: "prediction", value: scalar };
  } catch {
    return { kind: "invalid", reason: "format" };
  }
}

function promptOutput(
  analysis: ReturnType<typeof analyzeCapturedStagedSnapshot> & {
    readonly kind: "supported";
  },
): string {
  const summary = analysis.coverage.summary;

  return [
    "Skia staged review",
    `Evidence: ${analysis.analysis.evidence.relation}`,
    "Coverage: " +
      `supported=${summary.supported_units} ` +
      `partial=${summary.partial_units} ` +
      `unmapped=${summary.unmapped_units} ` +
      `unsupported=${summary.unsupported_units} ` +
      `failed=${summary.failed_units}`,
    `GIVEN ${analysis.analysis.scenario.given.parameter} = ` +
      JSON.stringify(analysis.analysis.scenario.given.value),
    `WHEN ${analysis.analysis.scenario.when}`,
    'Predict THEN as JSON, or type "skip":',
    "",
  ].join("\n");
}

function readPredictionInput(
  options: StagedReviewRunOptions,
  prompt: string,
): { readonly input: string; readonly promptWasEmitted: boolean } {
  if (options.read_input !== undefined) {
    return {
      input: options.read_input(prompt),
      promptWasEmitted: true,
    };
  }

  return {
    input: options.input ?? "",
    promptWasEmitted: false,
  };
}

function relativeReceiptPath(
  absolutePath: string,
  repositoryRoot: string,
): string {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
}

export function runStagedReview(
  options: StagedReviewRunOptions = {},
): StagedReviewRunResult {
  const repositoryRoot = options.repository_root ?? process.cwd();
  const now = options.now ?? (() => new Date());
  let allocation: StagedRunAllocation | null = null;
  let completed = false;

  try {
    const pipeline = analyzeCapturedStagedSnapshot(
      captureStagedSnapshot(repositoryRoot),
    );

    if (pipeline.kind !== "supported") {
      return {
        exit_code: 2,
        kind: "review_unsupported",
        output: `Skia staged review unavailable: ${pipeline.reason}\n`,
      };
    }

    const prompt = promptOutput(pipeline);
    const input = readPredictionInput(options, prompt);
    const prediction = parsePrediction(input.input);

    if (prediction.kind === "invalid") {
      return {
        exit_code: 2,
        kind: "invalid_prediction",
        output:
          (input.promptWasEmitted ? "" : prompt) +
          (
            prediction.reason === "limit"
              ? `Prediction exceeds the ${MAX_TERMINAL_INPUT_BYTES}-byte input limit.\n`
              : "Prediction must be a valid JSON scalar or \"skip\".\n"
          ),
      };
    }

    const sessionId = validateSessionId(options.session_id ?? "localsession");
    const activeAllocation = allocateStagedRun(repositoryRoot, sessionId, now());
    allocation = activeAllocation;

    if (prediction.kind === "skip") {
      const behaviorCard = writeStagedArtifactFile(
        activeAllocation,
        "behavior_cards",
        `${JSON.stringify({
          scenario: pipeline.analysis.scenario,
          action: "skip",
          sealed_at: formatRfc3339UtcSeconds(now()),
        }, null, 2)}\n`,
      );
      const receipt = createSkippedStagedReviewReceipt({
        allocation: activeAllocation,
        analysis: pipeline.analysis,
        behavior_card_artifact: behaviorCard,
        completed_at: now(),
        coverage: pipeline.coverage,
        snapshot: pipeline.snapshot,
      });
      const completedRun = completeStagedRun(activeAllocation, receipt);
      completed = true;
      const suffix = [
        "Prediction skipped.",
        `Receipt: ${relativeReceiptPath(completedRun.receiptPath, repositoryRoot)}`,
        "",
      ].join("\n");

      return {
        exit_code: 0,
        kind: "review_skipped",
        output: (input.promptWasEmitted ? "" : prompt) + suffix,
      };
    }

    const predictionSession = createPredictionSession(pipeline.analysis);
    const artifacts: ReturnType<typeof writeStagedArtifactFile>[] = [];
    const sealed = predictionSession.persistPrediction(
      {
        kind: "return_value",
        value: prediction.value,
      },
      (record) => {
        artifacts.push(
          writeStagedArtifactFile(
            activeAllocation,
            "behavior_cards",
            `${JSON.stringify(record, null, 2)}\n`,
          ),
        );
      },
      now(),
    );
    const behaviorCard = artifacts[0];

    if (behaviorCard === undefined) {
      throw new Error("prediction persistence produced no behavior-card artifact");
    }

    const sourceCheck = predictionSession.sourceCheck();
    const receipt = createStagedReviewReceipt({
      allocation: activeAllocation,
      analysis: pipeline.analysis,
      behavior_card_artifact: behaviorCard,
      completed_at: now(),
      coverage: pipeline.coverage,
      sealed_prediction: sealed,
      snapshot: pipeline.snapshot,
      source_check: sourceCheck,
    });
    const completedRun = completeStagedRun(activeAllocation, receipt);
    completed = true;
    const suffix = [
      `Source check: ${sourceCheck.status}`,
      `Expected source-derived return: ${JSON.stringify(sourceCheck.expected)}`,
      `Receipt: ${relativeReceiptPath(completedRun.receiptPath, repositoryRoot)}`,
      "",
    ].join("\n");

    return {
      exit_code: 0,
      kind: "review_complete",
      output: (input.promptWasEmitted ? "" : prompt) + suffix,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let cleanupMessage = "";

    if (allocation !== null && !completed) {
      try {
        abortStagedRun(allocation);
      } catch (cleanupError) {
        cleanupMessage =
          `; cleanup failed: ${
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError)
          }`;
      }
    }

    return {
      exit_code: 1,
      kind: "review_failed",
      output: `Skia staged review failed: ${message}${cleanupMessage}\n`,
    };
  }
}
