export const SKIA_DIRECTORY_NAME = ".skia";
export const DIST_DIRECTORY_NAME = "dist";
export const RECEIPTS_DIRECTORY_NAME = "receipts";
export const RUN_METADATA_FILENAME = "run-metadata.json";

export const OWNER_DIRECTORY_MODE = 0o700;
export const OWNER_FILE_MODE = 0o600;
export const MAX_RUN_ID_COLLISION_SUFFIX = 99;

export const LOCAL_RETENTION_CAVEAT =
  "There is no age-based automatic retention or background cleanup. Complete runs remain local until explicit exact-ID deletion succeeds.";

export const LOCAL_DURABILITY_CAVEAT =
  "Files are fsynced before completion where supported, but directory-entry and storage-device durability semantics vary by platform and filesystem.";

export const OWNER_PERMISSION_CAVEAT =
  "Owner-only permissions are requested where supported; some platforms may retain weaker semantics.";
