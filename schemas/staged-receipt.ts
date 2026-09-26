import type { SchemaDocument } from "./shared.js";
import { MAX_STAGED_TEXT_CHARACTERS } from "../src/limits.js";
import {
  artifactHashRecordSchema,
  commonEnvelopeProperties,
  completionTimestampInvariant,
  MAX_SAFE_JSON_INTEGER,
  RFC3339_UTC_PATTERN,
  sourceAnchorSchema,
} from "./shared.js";
import { coverageEnvelopeSchema } from "./shared.js";
import { snapshotIdentitySchema } from "./snapshot-identity.js";

const jsonScalarSchema = {
  anyOf: [
    { type: "string", maxLength: MAX_STAGED_TEXT_CHARACTERS },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
} as const;

const stagedScenarioSchema = {
  type: "object",
  additionalProperties: false,
  required: ["basis", "given", "when"],
  properties: {
    basis: { const: "literal_guard_match" },
    given: {
      type: "object",
      additionalProperties: false,
      required: ["parameter", "value"],
      properties: {
        parameter: {
          type: "string",
          minLength: 1,
          maxLength: MAX_STAGED_TEXT_CHARACTERS,
        },
        value: jsonScalarSchema,
      },
    },
    when: {
      type: "string",
      minLength: 1,
      maxLength: MAX_STAGED_TEXT_CHARACTERS,
    },
  },
} as const;

const stagedReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["card_status", "session_counts", "entity"],
  properties: {
    card_status: {
      type: "string",
      enum: ["complete", "skipped"],
    },
    session_counts: {
      type: "object",
      additionalProperties: false,
      required: ["prompts_presented", "predictions_completed", "skips"],
      properties: {
        prompts_presented: {
          type: "integer",
          minimum: 1,
          maximum: MAX_SAFE_JSON_INTEGER,
        },
        predictions_completed: {
          type: "integer",
          minimum: 0,
          maximum: MAX_SAFE_JSON_INTEGER,
        },
        skips: {
          type: "integer",
          minimum: 0,
          maximum: MAX_SAFE_JSON_INTEGER,
        },
      },
    },
    entity: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "name",
        "anchor",
        "evidence",
        "scenario",
        "prediction",
        "source_check",
      ],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          maxLength: MAX_STAGED_TEXT_CHARACTERS,
        },
        name: {
          type: "string",
          minLength: 1,
          maxLength: MAX_STAGED_TEXT_CHARACTERS,
        },
        anchor: sourceAnchorSchema,
        evidence: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "kind",
            "relation",
            "anchors",
            "derivation",
            "coverage",
            "claim_state",
            "details_available",
          ],
          properties: {
            id: {
              type: "string",
              minLength: 1,
              maxLength: MAX_STAGED_TEXT_CHARACTERS,
            },
            kind: { const: "guard" },
            relation: {
              type: "string",
              minLength: 1,
              maxLength: MAX_STAGED_TEXT_CHARACTERS,
            },
            anchors: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              items: sourceAnchorSchema,
            },
            derivation: { const: "deterministic" },
            coverage: { const: "supported" },
            claim_state: { const: "observed" },
            details_available: { const: false },
          },
        },
        scenario: stagedScenarioSchema,
        prediction: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["scenario", "prediction", "sealed_at"],
              properties: {
                scenario: stagedScenarioSchema,
                prediction: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind", "value"],
                  properties: {
                    kind: { const: "return_value" },
                    value: jsonScalarSchema,
                  },
                },
                sealed_at: {
                  type: "string",
                  pattern: RFC3339_UTC_PATTERN,
                },
              },
            },
            { type: "null" },
          ],
        },
        source_check: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["status", "expected", "predicted"],
              properties: {
                status: {
                  type: "string",
                  enum: [
                    "source_derived_match",
                    "source_derived_mismatch",
                  ],
                },
                expected: jsonScalarSchema,
                predicted: jsonScalarSchema,
              },
            },
            { type: "null" },
          ],
        },
      },
    },
  },
} as const;

export const stagedReceiptSchema = {
  $id: "https://skia.dev/schemas/staged-receipt.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "tool_version",
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
    tool_version: {
      type: "string",
      minLength: 1,
      maxLength: 32,
      pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$",
    },
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
    review: stagedReviewSchema,
  },
  allOf: [completionTimestampInvariant],
} as const satisfies SchemaDocument;
