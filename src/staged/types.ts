import type {
  CoverageEnvelope,
  CoverageState,
  GitObjectId,
  JsonScalar,
  RepositoryRelativePath,
  SourceAnchor,
  StableErrorReason,
  StagedSnapshotIdentity,
} from "../types.js";
export type { JsonScalar } from "../types.js";

export interface PilotEntity {
  readonly id: string;
  readonly name: string;
  readonly anchor: SourceAnchor;
}

export interface PilotEvidence {
  readonly id: string;
  readonly kind: "guard";
  readonly relation: string;
  readonly anchors: readonly [SourceAnchor, SourceAnchor];
  readonly derivation: "deterministic";
  readonly coverage: Extract<CoverageState, "supported">;
  readonly claim_state: "observed";
  readonly details_available: false;
}

export interface PilotScenario {
  readonly basis: "literal_guard_match";
  readonly given: {
    readonly parameter: string;
    readonly value: JsonScalar;
  };
  readonly when: string;
}

export interface PilotSupportedAnalysis {
  readonly kind: "supported";
  readonly entity: PilotEntity;
  readonly evidence: PilotEvidence;
  readonly scenario: PilotScenario;
  readonly expected_return: JsonScalar;
}

export interface PilotUnsupportedAnalysis {
  readonly kind: "unsupported";
  readonly reason: Extract<
    StableErrorReason,
    "no_supported_staged_entity" | "syntax_error" | "unmapped_region"
  >;
}

export interface PilotFailedAnalysis {
  readonly kind: "failed";
  readonly reason: Extract<
    StableErrorReason,
    "parse_failed" | "parse_timeout"
  >;
}

export type PilotAnalysis =
  | PilotSupportedAnalysis
  | PilotUnsupportedAnalysis
  | PilotFailedAnalysis;

export interface AnalyzeLiteralGuardFunctionOptions {
  readonly blob_oid: GitObjectId;
  readonly changed_lines: readonly number[];
  readonly path: RepositoryRelativePath;
  readonly source: string;
  readonly base_source?: string | null;
  readonly parser_command?: {
    readonly command: string;
    readonly args: readonly string[];
  };
  readonly timeout_ms?: number;
}

export interface ReturnValuePrediction {
  readonly kind: "return_value";
  readonly value: JsonScalar;
}

export interface SealedPrediction {
  readonly scenario: PilotScenario;
  readonly prediction: ReturnValuePrediction;
  readonly sealed_at: string;
}

export type SourceCheckResult =
  | {
    readonly status: "source_derived_match";
    readonly expected: JsonScalar;
    readonly predicted: JsonScalar;
  }
  | {
    readonly status: "source_derived_mismatch";
    readonly expected: JsonScalar;
    readonly predicted: JsonScalar;
  };

export interface PredictionSession {
  persistPrediction(
    prediction: ReturnValuePrediction,
    persist: (record: SealedPrediction) => void,
    sealedAt?: Date,
  ): SealedPrediction;
  sourceCheck(): SourceCheckResult;
}

export interface PilotParserNodeRange {
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
}

export interface PilotParserSuccess {
  readonly kind: "supported";
  readonly entity_name: string;
  readonly parameter_name: string;
  readonly guard_text: string;
  readonly guard_value: JsonScalar;
  readonly return_text: string;
  readonly return_value: JsonScalar;
  readonly invocation: string;
  readonly entity_range: PilotParserNodeRange;
  readonly guard_range: PilotParserNodeRange;
  readonly return_range: PilotParserNodeRange;
}

export interface PilotParserUnsupported {
  readonly kind: "unsupported";
  readonly reason?: "syntax_error";
}

export interface PilotParserFailed {
  readonly kind: "failed";
  readonly reason: "parse_failed";
}

export type PilotParserResponse =
  | PilotParserSuccess
  | PilotParserUnsupported
  | PilotParserFailed;

export interface SupportedStagedPipelineResult {
  readonly kind: "supported";
  readonly snapshot: StagedSnapshotIdentity;
  readonly analysis: PilotSupportedAnalysis;
  readonly changed_lines: readonly number[];
  readonly deleted_lines: readonly number[];
  readonly coverage: CoverageEnvelope;
}

export interface UnsupportedStagedPipelineResult {
  readonly kind: "unsupported";
  readonly reason: StableErrorReason;
  readonly coverage: CoverageEnvelope;
}

export interface FailedStagedPipelineResult {
  readonly kind: "failed";
  readonly reason: Extract<
    StableErrorReason,
    | "binary_source"
    | "invalid_source_encoding"
    | "parse_failed"
    | "parse_timeout"
  >;
  readonly coverage: CoverageEnvelope;
}

export type StagedPipelineResult =
  | SupportedStagedPipelineResult
  | UnsupportedStagedPipelineResult
  | FailedStagedPipelineResult;
