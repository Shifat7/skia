import type { SchemaDocument } from "./shared.js";
import {
  artifactHashRecordSchema,
  commonEnvelopeProperties,
  completionTimestampInvariant,
} from "./shared.js";
import { coverageEnvelopeSchema } from "./shared.js";
import { snapshotIdentitySchema } from "./snapshot-identity.js";

export const stagedReceiptSchema = {
  $id: "https://skia.dev/schemas/staged-receipt.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "run_id",
    "session_id",
    "status",
    "completed_at",
    "snapshot",
    "coverage",
    "artifact_hashes",
    "errors",
    "privacy_caveat",
  ],
  properties: {
    ...commonEnvelopeProperties,
    session_id: {
      type: "string",
      pattern: "^[a-z0-9]{8,32}$",
    },
    snapshot: {
      $ref: snapshotIdentitySchema.$id,
    },
    coverage: {
      $ref: coverageEnvelopeSchema.$id,
    },
    artifact_hashes: {
      type: "array",
      items: artifactHashRecordSchema,
    },
  },
  allOf: [completionTimestampInvariant],
} as const satisfies SchemaDocument;
