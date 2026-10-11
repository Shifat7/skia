export const SKIA_DIRECTORY_NAME = ".skia";
export const DIST_DIRECTORY_NAME = "dist";
export const ARTIFACTS_DIRECTORY_NAME = "artifacts";
export const RECEIPTS_DIRECTORY_NAME = "receipts";
export const RUN_ID_CLAIMS_DIRECTORY_NAME = "run-ids";
export const TMP_DIRECTORY_NAME = "tmp";
export const RUN_METADATA_FILENAME = "run-metadata.json";

export const OWNER_DIRECTORY_MODE = 0o700;
export const OWNER_FILE_MODE = 0o600;
export const MAX_RUN_ID_COLLISION_SUFFIX = 99;
export const DEFAULT_GIT_TIMEOUT_MS = 5_000;
export const DEFAULT_GIT_OUTPUT_LIMIT_BYTES = 1_000_000;
export const MAX_GIT_INDEX_BYTES = 16 * 1024 * 1024;
export const MAX_GIT_CAPTURED_BLOB_COUNT = 4_096;
export const MAX_GIT_CAPTURED_BLOB_BYTES = 16 * 1024 * 1024;
export const MAX_TERMINAL_INPUT_BYTES = 4_096;
export const MAX_STAGED_TEXT_CHARACTERS = 4_096;
export const MAX_STAGED_RECEIPT_BYTES = 1024 * 1024;
export const MAX_RUN_ID_CLAIM_BYTES = 1024 * 1024;
export const MAX_STAGED_ARTIFACT_BYTES = 1024 * 1024;
export const MAX_STAGED_CHANGED_LINES = 150;
export const TOOL_VERSION = "0.0.0";

export const LOCAL_RETENTION_CAVEAT =
  "There is no age-based automatic retention or background cleanup. Complete runs remain local until explicit exact-ID deletion succeeds.";

export const LOCAL_DURABILITY_CAVEAT =
  "Files are fsynced before completion where supported, but directory-entry and storage-device durability semantics vary by platform and filesystem.";

export const OWNER_PERMISSION_CAVEAT =
  "Owner-only permissions are requested where supported; some platforms may retain weaker semantics.";
