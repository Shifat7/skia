import type { SchemaDocument } from "./shared.js";
import {
  gitObjectIdSchema,
  nullableGitObjectIdSchema,
  nullableSha256Schema,
  sha256Schema,
  snapshotCheckoutSchema,
  snapshotBaseStateSchema,
  snapshotEntrySchema,
} from "./shared.js";

export const snapshotIdentitySchema = {
  $id: "https://skia.dev/schemas/snapshot-identity.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "checkout",
        "base_state",
        "base_commit",
        "copied_index_sha256",
        "live_index_sha256",
        "diff_sha256",
        "entries",
      ],
      properties: {
        kind: {
          const: "staged",
        },
        checkout: snapshotCheckoutSchema,
        base_state: snapshotBaseStateSchema,
        base_commit: nullableGitObjectIdSchema,
        copied_index_sha256: sha256Schema,
        live_index_sha256: nullableSha256Schema,
        diff_sha256: sha256Schema,
        entries: {
          type: "array",
          items: snapshotEntrySchema,
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "commit_oid",
        "tree_sha256",
        "working_changes_included",
        "entries",
      ],
      properties: {
        kind: {
          const: "repository",
        },
        commit_oid: gitObjectIdSchema,
        tree_sha256: sha256Schema,
        working_changes_included: {
          const: false,
        },
        entries: {
          type: "array",
          items: snapshotEntrySchema,
        },
      },
    },
  ],
} as const satisfies SchemaDocument;
