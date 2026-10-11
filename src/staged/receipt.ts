import { createHash } from "node:crypto";

import { TOOL_VERSION } from "../limits.js";
import { deriveStagedReceiptPath } from "../paths.js";
import {
  STAGED_RECEIPT_PRIVACY_CAVEAT,
  type StagedArtifactWriteResult,
  type StagedRunAllocation,
} from "../storage.js";
import { formatRfc3339UtcSeconds } from "../time.js";
import type {
  CoverageEnvelope,
  Sha256Hex,
  StagedReceipt,
  StagedSnapshotIdentity,
} from "../types.js";
import type {
  PilotSupportedAnalysis,
  SealedPrediction,
  SourceCheckResult,
} from "./types.js";

export interface CreateStagedReviewReceiptOptions {
  readonly allocation: StagedRunAllocation;
  readonly analysis: PilotSupportedAnalysis;
  readonly behavior_card_artifact: StagedArtifactWriteResult;
  readonly completed_at: Date;
  readonly coverage: CoverageEnvelope;
  readonly sealed_prediction: SealedPrediction;
  readonly snapshot: StagedSnapshotIdentity;
  readonly source_check: SourceCheckResult;
}

export interface CreateSkippedStagedReviewReceiptOptions {
  readonly allocation: StagedRunAllocation;
  readonly analysis: PilotSupportedAnalysis;
  readonly behavior_card_artifact: StagedArtifactWriteResult;
  readonly completed_at: Date;
  readonly coverage: CoverageEnvelope;
  readonly snapshot: StagedSnapshotIdentity;
}

function sha256(value: string): Sha256Hex {
  return createHash("sha256").update(value).digest("hex") as Sha256Hex;
}

function completedAt(value: Date): string {
  return formatRfc3339UtcSeconds(value);
}

function withSelfHash(receiptWithoutSelf: StagedReceipt): StagedReceipt {
  const selfHash = sha256(`${JSON.stringify(receiptWithoutSelf, null, 2)}\n`);

  return {
    ...receiptWithoutSelf,
    artifact_hashes: [
      ...receiptWithoutSelf.artifact_hashes,
      {
        kind: "receipt",
        path: deriveStagedReceiptPath(
          receiptWithoutSelf.run_id,
          receiptWithoutSelf.session_id,
        ),
        sha256: selfHash,
      },
    ],
  };
}

function receiptBase(
  options:
    | CreateStagedReviewReceiptOptions
    | CreateSkippedStagedReviewReceiptOptions,
): Omit<StagedReceipt, "review"> {
  return {
    schema_version: 1,
    tool_version: TOOL_VERSION,
    run_id: options.allocation.runId,
    session_id: options.allocation.sessionId,
    status: "complete",
    completed_at: completedAt(options.completed_at),
    snapshot: options.snapshot,
    coverage: options.coverage,
    artifact_hashes: [
      {
        kind: "behavior_cards",
        path: options.behavior_card_artifact.artifactPath,
        sha256: options.behavior_card_artifact.sha256,
      },
    ],
    errors: [],
    privacy_caveat: STAGED_RECEIPT_PRIVACY_CAVEAT,
  };
}

export function createStagedReviewReceipt(
  options: CreateStagedReviewReceiptOptions,
): StagedReceipt {
  return withSelfHash({
    ...receiptBase(options),
    review: {
      card_status: "complete",
      session_counts: {
        prompts_presented: 1,
        predictions_completed: 1,
        skips: 0,
      },
      entity: {
        id: options.analysis.entity.id,
        name: options.analysis.entity.name,
        anchor: options.analysis.entity.anchor,
        evidence: options.analysis.evidence,
        scenario: options.analysis.scenario,
        prediction: options.sealed_prediction,
        source_check: options.source_check,
      },
    },
  });
}

export function createSkippedStagedReviewReceipt(
  options: CreateSkippedStagedReviewReceiptOptions,
): StagedReceipt {
  return withSelfHash({
    ...receiptBase(options),
    review: {
      card_status: "skipped",
      session_counts: {
        prompts_presented: 1,
        predictions_completed: 0,
        skips: 1,
      },
      entity: {
        id: options.analysis.entity.id,
        name: options.analysis.entity.name,
        anchor: options.analysis.entity.anchor,
        evidence: options.analysis.evidence,
        scenario: options.analysis.scenario,
        prediction: null,
        source_check: null,
      },
    },
  });
}
