import type { AnySchemaObject } from "ajv/dist/2020.js";

import {
  ANCHOR_SIDES,
  ARTIFACT_STATES,
  COVERAGE_STATES,
  GIT_CHECKOUT_STATES,
  HASHED_ARTIFACT_KINDS,
  MANIFEST_ARTIFACT_KINDS,
  RUN_STATES,
  SNAPSHOT_BASE_STATES,
  SOURCE_LANGUAGES,
  STABLE_ERROR_REASONS,
} from "../src/types.js";

export type SchemaDocument = AnySchemaObject & {
  readonly $id: string;
};

export const RFC3339_UTC_PATTERN =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$";
export const GIT_OBJECT_ID_PATTERN = "^(?:[0-9a-f]{40}|[0-9a-f]{64})$";
export const SHA256_PATTERN = "^[0-9a-f]{64}$";
export const RUN_ID_PATTERN = "^[0-9]{8}T[0-9]{6}Z(?:-[0-9]{2})?$";
export const SESSION_ID_PATTERN = "^[a-z0-9]{8,32}$";
export const MAX_SAFE_JSON_INTEGER = Number.MAX_SAFE_INTEGER;
export const RELATIVE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:[\\\\/])(?!.*\\\\)(?!.*[\\u0000-\\u001f\\u007f])(?!.*(?:^|/)\\.\\.?(/|$))(?!.*//)(?!.*\\/$)[^\\u0000-\\u001f\\u007f]+$";
export const GIT_MODE_PATTERN = "^[0-7]{6}$";

export const gitObjectIdSchema = {
  type: "string",
  pattern: GIT_OBJECT_ID_PATTERN,
} as const;

export const nullableGitObjectIdSchema = {
  anyOf: [gitObjectIdSchema, { type: "null" }],
} as const;

export const sha256Schema = {
  type: "string",
  pattern: SHA256_PATTERN,
} as const;

export const nullableSha256Schema = {
  anyOf: [sha256Schema, { type: "null" }],
} as const;

export const relativePathSchema = {
  type: "string",
  minLength: 1,
  pattern: RELATIVE_PATH_PATTERN,
} as const;

export const runArtifactPathSchema = relativePathSchema;

export const sourceLanguageSchema = {
  type: "string",
  enum: [...SOURCE_LANGUAGES],
} as const;

export const nullableSourceLanguageSchema = {
  anyOf: [sourceLanguageSchema, { type: "null" }],
} as const;

export const stableErrorReasonSchema = {
  type: "string",
  enum: [...STABLE_ERROR_REASONS],
} as const;

export const stableIssueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reason", "path", "detail"],
  properties: {
    reason: stableErrorReasonSchema,
    path: {
      anyOf: [relativePathSchema, { type: "null" }],
    },
    detail: {
      anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
    },
  },
} as const;

export const sourceAnchorSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "side",
    "path",
    "blob_oid",
    "language",
    "start_line",
    "start_column",
    "end_line",
    "end_column",
  ],
  properties: {
    side: {
      type: "string",
      enum: [...ANCHOR_SIDES],
    },
    path: relativePathSchema,
    blob_oid: gitObjectIdSchema,
    language: sourceLanguageSchema,
    start_line: {
      type: "integer",
      minimum: 1,
    },
    start_column: {
      type: "integer",
      minimum: 0,
    },
    end_line: {
      type: "integer",
      minimum: 1,
    },
    end_column: {
      type: "integer",
      minimum: 0,
    },
  },
} as const;

export const coverageEventSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "coverage", "units", "reason", "path", "language", "anchors"],
  properties: {
    id: {
      type: "string",
      minLength: 1,
    },
    coverage: {
      type: "string",
      enum: [...COVERAGE_STATES],
    },
    units: {
      type: "integer",
      minimum: 1,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    reason: {
      anyOf: [stableErrorReasonSchema, { type: "null" }],
    },
    path: {
      anyOf: [relativePathSchema, { type: "null" }],
    },
    language: nullableSourceLanguageSchema,
    anchors: {
      type: "array",
      items: sourceAnchorSchema,
    },
  },
  allOf: [
    {
      if: {
        properties: {
          coverage: {
            const: "supported",
          },
        },
        required: ["coverage"],
      },
      then: {
        properties: {
          reason: {
            type: "null",
          },
        },
      },
      else: {
        properties: {
          reason: stableErrorReasonSchema,
        },
      },
    },
  ],
} as const;

export const coverageSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "total_units",
    "supported_units",
    "partial_units",
    "unmapped_units",
    "unsupported_units",
    "excluded_units",
    "failed_units",
    "unchecked_units",
  ],
  properties: {
    total_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    supported_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    partial_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    unmapped_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    unsupported_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    excluded_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    failed_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
    unchecked_units: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SAFE_JSON_INTEGER,
    },
  },
} as const;

export const coverageEnvelopeSchema = {
  $id: "https://skia.dev/schemas/coverage.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["summary", "events"],
  properties: {
    summary: coverageSummarySchema,
    events: {
      type: "array",
      items: coverageEventSchema,
    },
  },
} as const satisfies SchemaDocument;

export const snapshotEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "path",
    "mode",
    "language",
    "base_blob_oid",
    "snapshot_blob_oid",
  ],
  properties: {
    path: relativePathSchema,
    mode: {
      type: "string",
      pattern: GIT_MODE_PATTERN,
    },
    language: nullableSourceLanguageSchema,
    base_blob_oid: nullableGitObjectIdSchema,
    snapshot_blob_oid: nullableGitObjectIdSchema,
  },
} as const;

export const runStateSchema = {
  type: "string",
  enum: [...RUN_STATES],
} as const;

export const artifactHashRecordSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "path", "sha256"],
  properties: {
    kind: {
      type: "string",
      enum: [...HASHED_ARTIFACT_KINDS],
    },
    path: runArtifactPathSchema,
    sha256: sha256Schema,
  },
} as const;

export const artifactDescriptorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "path", "state"],
  properties: {
    kind: {
      type: "string",
      enum: [...MANIFEST_ARTIFACT_KINDS],
    },
    path: runArtifactPathSchema,
    state: {
      type: "string",
      enum: [...ARTIFACT_STATES],
    },
    sha256: sha256Schema,
    not_available_reason: stableErrorReasonSchema,
  },
  allOf: [
    {
      if: {
        properties: {
          state: {
            const: "complete",
          },
        },
        required: ["state"],
      },
      then: {
        properties: {
          sha256: sha256Schema,
          not_available_reason: false,
        },
        required: ["sha256"],
      },
    },
    {
      if: {
        properties: {
          state: {
            const: "not_available",
          },
        },
        required: ["state"],
      },
      then: {
        properties: {
          sha256: false,
          not_available_reason: stableErrorReasonSchema,
        },
        required: ["not_available_reason"],
      },
    },
    {
      if: {
        properties: {
          state: {
            const: "incomplete",
          },
        },
        required: ["state"],
      },
      then: {
        properties: {
          sha256: false,
          not_available_reason: false,
        },
      },
    },
  ],
} as const;

export const commonEnvelopeProperties = {
  schema_version: {
    const: 1,
  },
  run_id: {
    type: "string",
    pattern: RUN_ID_PATTERN,
  },
  status: runStateSchema,
  completed_at: {
    anyOf: [
      {
        type: "string",
        pattern: RFC3339_UTC_PATTERN,
      },
      {
        type: "null",
      },
    ],
  },
  coverage: {
    $ref: coverageEnvelopeSchema.$id,
  },
  errors: {
    type: "array",
    items: stableIssueSchema,
  },
  privacy_caveat: {
    type: "string",
    minLength: 1,
  },
} as const;

export const completionTimestampInvariant = {
  if: {
    properties: {
      status: {
        const: "incomplete",
      },
    },
    required: ["status"],
  },
  then: {
    properties: {
      completed_at: {
        type: "null",
      },
    },
  },
  else: {
    properties: {
      completed_at: {
        type: "string",
        pattern: RFC3339_UTC_PATTERN,
      },
    },
  },
} as const;

export const snapshotBaseStateSchema = {
  type: "string",
  enum: [...SNAPSHOT_BASE_STATES],
} as const;

export const snapshotCheckoutSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "branch_name"],
  properties: {
    state: {
      type: "string",
      enum: [...GIT_CHECKOUT_STATES],
    },
    branch_name: {
      anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
    },
  },
} as const;
