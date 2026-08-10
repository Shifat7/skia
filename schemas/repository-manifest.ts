import type { SchemaDocument } from "./shared.js";
import {
  artifactDescriptorSchema,
  commonEnvelopeProperties,
  completionTimestampInvariant,
  runArtifactPathSchema,
} from "./shared.js";
import { coverageEnvelopeSchema } from "./shared.js";
import { snapshotIdentitySchema } from "./snapshot-identity.js";

export const repositoryManifestSchema = {
  $id: "https://skia.dev/schemas/repository-manifest.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "run_id",
    "status",
    "completed_at",
    "snapshot",
    "coverage",
    "artifacts",
    "coverage_file",
    "cards_file",
    "errors",
    "privacy_caveat",
  ],
  properties: {
    ...commonEnvelopeProperties,
    snapshot: {
      $ref: snapshotIdentitySchema.$id,
    },
    coverage: {
      $ref: coverageEnvelopeSchema.$id,
    },
    artifacts: {
      type: "array",
      items: artifactDescriptorSchema,
    },
    coverage_file: runArtifactPathSchema,
    cards_file: runArtifactPathSchema,
  },
  allOf: [completionTimestampInvariant],
} as const satisfies SchemaDocument;
