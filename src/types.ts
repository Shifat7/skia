type BrandedString<Name extends string> = string & {
  readonly __brand: Name;
};

export const SOURCE_LANGUAGES = ["typescript", "tsx", "python"] as const;
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];

export const SNAPSHOT_KINDS = ["staged", "repository"] as const;
export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

export const SNAPSHOT_BASE_STATES = ["present", "unborn"] as const;
export type SnapshotBaseState = (typeof SNAPSHOT_BASE_STATES)[number];

export const GIT_CHECKOUT_STATES = ["branch", "detached"] as const;
export type GitCheckoutState = (typeof GIT_CHECKOUT_STATES)[number];

export const ANCHOR_SIDES = ["base", "staged", "repository"] as const;
export type AnchorSide = (typeof ANCHOR_SIDES)[number];

export const COVERAGE_STATES = [
  "supported",
  "partial",
  "unmapped",
  "unsupported",
  "excluded",
  "failed",
  "unchecked",
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const RUN_STATES = ["complete", "partial", "incomplete"] as const;
export type RunState = (typeof RUN_STATES)[number];

export const ARTIFACT_STATES = [
  "complete",
  "not_available",
  "incomplete",
] as const;
export type ArtifactState = (typeof ARTIFACT_STATES)[number];

export const HASHED_ARTIFACT_KINDS = [
  "receipt",
  "hld",
  "lld",
  "collapsed_evidence",
  "behavior_cards",
  "coverage",
  "manifest",
] as const;
export type HashedArtifactKind = (typeof HASHED_ARTIFACT_KINDS)[number];

export const MANIFEST_ARTIFACT_KINDS = [
  "hld",
  "lld",
  "collapsed_evidence",
  "behavior_cards",
  "coverage",
] as const;
export type ManifestArtifactKind = (typeof MANIFEST_ARTIFACT_KINDS)[number];

export const STABLE_ERROR_REASONS = [
  "agent_consent_declined",
  "agent_output_limit_exceeded",
  "agent_unavailable",
  "binary_source",
  "generated_path",
  "git_output_limit_exceeded",
  "git_process_failed",
  "git_timeout",
  "index_changed",
  "interrupted_run",
  "invalid_parse_region",
  "invalid_source_encoding",
  "malformed_agent_output",
  "missing_local_object",
  "missing_source_anchor",
  "no_head_commit",
  "no_supported_staged_entity",
  "not_a_git_repository",
  "output_root_symlink",
  "parse_timeout",
  "repository_limit_exceeded",
  "run_id_exhausted",
  "schema_validation_failed",
  "staged_budget_exceeded",
  "subsystem_selection_required",
  "syntax_error",
  "unchecked_subsystem",
  "unborn_head",
  "unmapped_region",
  "unsupported_file_mode",
  "unsupported_language",
  "unsupported_status",
  "unsafe_permissions",
  "write_error",
] as const;
export type StableErrorReason = (typeof STABLE_ERROR_REASONS)[number];

export type RepositoryRelativePath = BrandedString<"RepositoryRelativePath">;
export type RunArtifactPath = BrandedString<"RunArtifactPath">;
export type GitObjectId = BrandedString<"GitObjectId">;
export type Sha256Hex = BrandedString<"Sha256Hex">;
export type RunId = BrandedString<"RunId">;
export type SessionId = BrandedString<"SessionId">;
export type CoverageEventId = BrandedString<"CoverageEventId">;

export interface SnapshotEntry {
  readonly path: RepositoryRelativePath;
  readonly mode: string;
  readonly language: SourceLanguage | null;
  readonly base_blob_oid: GitObjectId | null;
  readonly snapshot_blob_oid: GitObjectId | null;
}

export interface SnapshotCheckout {
  readonly state: GitCheckoutState;
  readonly branch_name: string | null;
}

export interface GitStatusEntry {
  readonly status: string;
  readonly path_bytes: Uint8Array;
  readonly path_display: string;
  readonly previous_path_bytes: Uint8Array | null;
  readonly previous_path_display: string | null;
}

export interface GitRawSnapshotRecord {
  readonly status: string;
  readonly path_bytes: Uint8Array;
  readonly path_display: string;
  readonly previous_path_bytes: Uint8Array | null;
  readonly previous_path_display: string | null;
  readonly previous_mode: string | null;
  readonly mode: string;
  readonly base_blob_oid: GitObjectId | null;
  readonly staged_blob_oid: GitObjectId | null;
}

export interface GitCapturedBlob {
  readonly oid: GitObjectId;
  readonly bytes: Uint8Array;
}

export interface StagedSnapshotIdentity {
  readonly kind: "staged";
  readonly base_state: SnapshotBaseState;
  readonly base_commit: GitObjectId | null;
  readonly copied_index_sha256: Sha256Hex;
  readonly live_index_sha256: Sha256Hex | null;
  readonly diff_sha256: Sha256Hex;
  readonly entries: readonly SnapshotEntry[];
}

export interface RepositorySnapshotIdentity {
  readonly kind: "repository";
  readonly commit_oid: GitObjectId;
  readonly tree_sha256: Sha256Hex;
  readonly working_changes_included: false;
  readonly entries: readonly SnapshotEntry[];
}

export type SnapshotIdentity =
  | StagedSnapshotIdentity
  | RepositorySnapshotIdentity;

export interface StagedSnapshotCapture {
  readonly checkout: SnapshotCheckout;
  readonly identity: StagedSnapshotIdentity;
  readonly status_entries: readonly GitStatusEntry[];
  readonly raw_records: readonly GitRawSnapshotRecord[];
  readonly patch_bytes: Uint8Array;
  readonly captured_blobs: readonly GitCapturedBlob[];
}

export interface RepositorySnapshotCapture {
  readonly checkout: SnapshotCheckout;
  readonly identity: RepositorySnapshotIdentity;
  readonly captured_blobs: readonly GitCapturedBlob[];
}

export interface SourceAnchor {
  readonly side: AnchorSide;
  readonly path: RepositoryRelativePath;
  readonly blob_oid: GitObjectId;
  readonly language: SourceLanguage;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
}

export interface SyntaxErrorRange {
  readonly start_byte: number;
  readonly end_byte: number;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
}

export type ParseFailureReason = Extract<
  StableErrorReason,
  | "binary_source"
  | "invalid_parse_region"
  | "invalid_source_encoding"
  | "parse_timeout"
>;

export interface ParsedSource {
  readonly kind: "parsed";
  readonly language: SourceLanguage;
  readonly syntax_error_ranges: readonly [];
}

export interface PartiallyParsedSource {
  readonly kind: "partial";
  readonly language: SourceLanguage;
  readonly syntax_error_ranges: readonly [SyntaxErrorRange, ...SyntaxErrorRange[]];
}

export interface FailedParse {
  readonly kind: "failed";
  readonly language: SourceLanguage;
  readonly reason: ParseFailureReason;
  readonly syntax_error_ranges: readonly [];
}

export type ParseResult = ParsedSource | PartiallyParsedSource | FailedParse;

export interface CoverageEvent {
  readonly id: CoverageEventId;
  readonly coverage: CoverageState;
  readonly units: number;
  readonly reason: StableErrorReason | null;
  readonly path: RepositoryRelativePath | null;
  readonly language: SourceLanguage | null;
  readonly anchors: readonly SourceAnchor[];
}

export interface CoverageSummary {
  readonly total_units: number;
  readonly supported_units: number;
  readonly partial_units: number;
  readonly unmapped_units: number;
  readonly unsupported_units: number;
  readonly excluded_units: number;
  readonly failed_units: number;
  readonly unchecked_units: number;
}

export interface CoverageEnvelope {
  readonly summary: CoverageSummary;
  readonly events: readonly CoverageEvent[];
}

export interface ArtifactHashRecord {
  readonly kind: HashedArtifactKind;
  readonly path: RunArtifactPath;
  readonly sha256: Sha256Hex;
}

export interface CompleteArtifactDescriptor {
  readonly kind: ManifestArtifactKind;
  readonly path: RunArtifactPath;
  readonly state: "complete";
  readonly sha256: Sha256Hex;
}

export interface NotAvailableArtifactDescriptor {
  readonly kind: ManifestArtifactKind;
  readonly path: RunArtifactPath;
  readonly state: "not_available";
  readonly not_available_reason: StableErrorReason;
}

export interface IncompleteArtifactDescriptor {
  readonly kind: ManifestArtifactKind;
  readonly path: RunArtifactPath;
  readonly state: "incomplete";
}

export type ArtifactDescriptor =
  | CompleteArtifactDescriptor
  | NotAvailableArtifactDescriptor
  | IncompleteArtifactDescriptor;

export interface StableIssue {
  readonly reason: StableErrorReason;
  readonly path: RepositoryRelativePath | null;
  readonly detail: string | null;
}

export interface StagedReceipt {
  readonly schema_version: 1;
  readonly run_id: RunId;
  readonly session_id: SessionId;
  readonly status: RunState;
  readonly completed_at: string | null;
  readonly snapshot: StagedSnapshotIdentity;
  readonly coverage: CoverageEnvelope;
  readonly artifact_hashes: readonly ArtifactHashRecord[];
  readonly errors: readonly StableIssue[];
  readonly privacy_caveat: string;
}

export interface RepositoryManifest {
  readonly schema_version: 1;
  readonly run_id: RunId;
  readonly status: RunState;
  readonly completed_at: string | null;
  readonly snapshot: RepositorySnapshotIdentity;
  readonly coverage: CoverageEnvelope;
  readonly artifacts: readonly ArtifactDescriptor[];
  readonly coverage_file: RunArtifactPath;
  readonly cards_file: RunArtifactPath;
  readonly errors: readonly StableIssue[];
  readonly privacy_caveat: string;
}
