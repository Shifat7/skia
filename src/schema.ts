import {
  Ajv2020,
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import { repositoryManifestSchema } from "../schemas/repository-manifest.js";
import { snapshotIdentitySchema } from "../schemas/snapshot-identity.js";
import { stagedReceiptSchema } from "../schemas/staged-receipt.js";
import {
  coverageEnvelopeSchema,
  RFC3339_UTC_PATTERN,
} from "../schemas/shared.js";
import type {
  ArtifactDescriptor,
  ArtifactHashRecord,
  CoverageEnvelope,
  CoverageEvent,
  CoverageState,
  RepositoryManifest,
  SnapshotEntry,
  SnapshotIdentity,
  SourceAnchor,
  StagedReceipt,
} from "./types.js";

const RFC3339_UTC_REGEX = new RegExp(RFC3339_UTC_PATTERN);

export interface SchemaValidationError {
  readonly instance_path: string;
  readonly message: string;
  readonly keyword: string;
}

export type SchemaValidationResult<T> =
  | {
      readonly valid: true;
      readonly value: T;
    }
  | {
      readonly valid: false;
      readonly errors: readonly SchemaValidationError[];
    };

type Invariant<T> = (value: T) => readonly SchemaValidationError[];

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictSchema: true,
  discriminator: true,
  validateSchema: true,
});

const schemaDocuments = [
  snapshotIdentitySchema,
  coverageEnvelopeSchema,
  stagedReceiptSchema,
  repositoryManifestSchema,
] as const satisfies readonly AnySchemaObject[];

for (const schemaDocument of schemaDocuments) {
  ajv.addSchema(schemaDocument);
}

const snapshotIdentityValidator = mustGetValidator<SnapshotIdentity>(
  snapshotIdentitySchema.$id,
);
const coverageEnvelopeValidator = mustGetValidator<CoverageEnvelope>(
  coverageEnvelopeSchema.$id,
);
const stagedReceiptValidator = mustGetValidator<StagedReceipt>(
  stagedReceiptSchema.$id,
);
const repositoryManifestValidator = mustGetValidator<RepositoryManifest>(
  repositoryManifestSchema.$id,
);

function mustGetValidator<T>(schemaId: string): ValidateFunction<T> {
  const validator = ajv.getSchema<T>(schemaId);

  if (validator === undefined) {
    throw new Error(`missing validator for schema ${schemaId}`);
  }

  return validator;
}

function toSchemaErrors(
  errors: readonly ErrorObject[] | null | undefined,
): readonly SchemaValidationError[] {
  if (errors === undefined || errors === null) {
    return [];
  }

  return errors.map((error) => ({
    instance_path: error.instancePath,
    message: error.message ?? "schema validation failed",
    keyword: error.keyword,
  }));
}

function invalid<T>(
  errors: readonly SchemaValidationError[],
): SchemaValidationResult<T> {
  return {
    valid: false,
    errors,
  };
}

function valid<T>(value: T): SchemaValidationResult<T> {
  return {
    valid: true,
    value,
  };
}

function validRfc3339Utc(value: string): boolean {
  if (!RFC3339_UTC_REGEX.test(value)) {
    return false;
  }

  const timestamp = new Date(value);
  return (
    Number.isFinite(timestamp.getTime()) &&
    timestamp.toISOString().replace(".000Z", "Z") === value
  );
}

function completionTimestampErrors(value: {
  readonly status: string;
  readonly completed_at: string | null;
}): readonly SchemaValidationError[] {
  if (value.completed_at === null || validRfc3339Utc(value.completed_at)) {
    return [];
  }

  return [
    {
      instance_path: "/completed_at",
      keyword: "rfc3339_calendar",
      message: "completed_at must be a real UTC calendar timestamp",
    },
  ];
}

function validateWithInvariants<T>(
  validator: ValidateFunction<T>,
  value: unknown,
  invariants: readonly Invariant<T>[],
): SchemaValidationResult<T> {
  if (!validator(value)) {
    return invalid(toSchemaErrors(validator.errors));
  }

  const typedValue = value as T;
  const invariantErrors = invariants.flatMap((invariant) => invariant(typedValue));

  if (invariantErrors.length > 0) {
    return invalid(invariantErrors);
  }

  return valid(typedValue);
}

function duplicateValues(
  values: readonly string[],
): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}

function aggregateUnits(
  events: readonly CoverageEvent[],
): Readonly<Record<CoverageState, number>> {
  const totals: Record<CoverageState, number> = {
    supported: 0,
    partial: 0,
    unmapped: 0,
    unsupported: 0,
    excluded: 0,
    failed: 0,
    unchecked: 0,
  };

  for (const event of events) {
    totals[event.coverage] += event.units;
  }

  return totals;
}

function validateSourceAnchor(anchor: SourceAnchor): readonly SchemaValidationError[] {
  if (anchor.end_line < anchor.start_line) {
    return [
      {
        instance_path: "/anchors",
        keyword: "anchor_order",
        message: "source anchor end_line must not be before start_line",
      },
    ];
  }

  if (
    anchor.end_line === anchor.start_line &&
    anchor.end_column < anchor.start_column
  ) {
    return [
      {
        instance_path: "/anchors",
        keyword: "anchor_order",
        message: "source anchor end_column must not be before start_column on the same line",
      },
    ];
  }

  return [];
}

function validateSnapshotEntries(
  entries: readonly SnapshotEntry[],
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const duplicatePaths = duplicateValues(entries.map((entry) => entry.path));

  for (const path of duplicatePaths) {
    errors.push({
      instance_path: "/entries",
      keyword: "unique_paths",
      message: `snapshot entries must use unique paths; duplicate path ${path}`,
    });
  }

  for (const [index, entry] of entries.entries()) {
    if (entry.base_blob_oid === null && entry.snapshot_blob_oid === null) {
      errors.push({
        instance_path: `/entries/${index}`,
        keyword: "blob_identity",
        message:
          "snapshot entry must expose at least one blob identity in base_blob_oid or snapshot_blob_oid",
      });
    }
  }

  return errors;
}

function snapshotIdentityInvariants(
  value: SnapshotIdentity,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [...validateSnapshotEntries(value.entries)];

  if (value.kind === "staged") {
    if (value.base_state === "present" && value.base_commit === null) {
      errors.push({
        instance_path: "/base_commit",
        keyword: "base_state",
        message: "base_commit is required when base_state is present",
      });
    }

    if (value.base_state === "unborn" && value.base_commit !== null) {
      errors.push({
        instance_path: "/base_commit",
        keyword: "base_state",
        message: "base_commit must be null when base_state is unborn",
      });
    }
  }

  return errors;
}

function coverageEnvelopeInvariants(
  value: CoverageEnvelope,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const units = aggregateUnits(value.events);
  const totalFromEvents =
    units.supported +
    units.partial +
    units.unmapped +
    units.unsupported +
    units.excluded +
    units.failed +
    units.unchecked;

  const summaryPairs = [
    ["supported", value.summary.supported_units, units.supported],
    ["partial", value.summary.partial_units, units.partial],
    ["unmapped", value.summary.unmapped_units, units.unmapped],
    ["unsupported", value.summary.unsupported_units, units.unsupported],
    ["excluded", value.summary.excluded_units, units.excluded],
    ["failed", value.summary.failed_units, units.failed],
    ["unchecked", value.summary.unchecked_units, units.unchecked],
  ] as const;

  for (const [coverage, actual, expected] of summaryPairs) {
    if (actual !== expected) {
      errors.push({
        instance_path: "/summary",
        keyword: "coverage_arithmetic",
        message: `summary ${coverage}_units must equal the aggregated event units`,
      });
    }
  }

  if (value.summary.total_units !== totalFromEvents) {
    errors.push({
      instance_path: "/summary",
      keyword: "coverage_arithmetic",
      message: "summary total_units must equal the aggregated event units",
    });
  }

  for (const [index, event] of value.events.entries()) {
    for (const anchorError of event.anchors.flatMap(validateSourceAnchor)) {
      errors.push({
        ...anchorError,
        instance_path: `/events/${index}${anchorError.instance_path}`,
      });
    }
  }

  return errors;
}

function validateArtifactHashes(
  artifactHashes: readonly ArtifactHashRecord[],
  runId: string,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const duplicatePaths = duplicateValues(artifactHashes.map((artifact) => artifact.path));

  for (const path of duplicatePaths) {
    errors.push({
      instance_path: "/artifact_hashes",
      keyword: "unique_paths",
      message: `artifact hashes must use unique paths; duplicate path ${path}`,
    });
  }

  for (const [index, artifact] of artifactHashes.entries()) {
    if (!artifact.path.includes(runId)) {
      errors.push({
        instance_path: `/artifact_hashes/${index}/path`,
        keyword: "run_id_path_match",
        message: "artifact hash paths must include the receipt run_id",
      });
    }
  }

  return errors;
}

function stagedReceiptInvariants(
  value: StagedReceipt,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  if (value.snapshot.kind !== "staged") {
    errors.push({
      instance_path: "/snapshot/kind",
      keyword: "snapshot_kind",
      message: "staged receipts must embed a staged snapshot",
    });
  }

  return [
    ...errors,
    ...completionTimestampErrors(value),
    ...validateArtifactHashes(value.artifact_hashes, value.run_id),
  ];
}

function validateArtifactDescriptors(
  artifacts: readonly ArtifactDescriptor[],
  runId: string,
  status: RepositoryManifest["status"],
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const duplicateKinds = duplicateValues(artifacts.map((artifact) => artifact.kind));
  const duplicatePaths = duplicateValues(artifacts.map((artifact) => artifact.path));

  for (const kind of duplicateKinds) {
    errors.push({
      instance_path: "/artifacts",
      keyword: "unique_kinds",
      message: `manifest artifacts must use unique kinds; duplicate kind ${kind}`,
    });
  }

  for (const path of duplicatePaths) {
    errors.push({
      instance_path: "/artifacts",
      keyword: "unique_paths",
      message: `manifest artifacts must use unique paths; duplicate path ${path}`,
    });
  }

  const presentKinds = new Set(artifacts.map((artifact) => artifact.kind));
  for (const kind of ["hld", "lld", "collapsed_evidence", "behavior_cards", "coverage"] as const) {
    if (!presentKinds.has(kind)) {
      errors.push({
        instance_path: "/artifacts",
        keyword: "required_kinds",
        message: `manifest artifacts must include a descriptor for ${kind}`,
      });
    }
  }

  for (const [index, artifact] of artifacts.entries()) {
    if (!artifact.path.includes(runId)) {
      errors.push({
        instance_path: `/artifacts/${index}/path`,
        keyword: "run_id_path_match",
        message: "manifest artifact paths must include the manifest run_id",
      });
    }

    if (status === "complete" && artifact.state === "incomplete") {
      errors.push({
        instance_path: `/artifacts/${index}/state`,
        keyword: "artifact_state",
        message: "complete manifests cannot reference incomplete artifacts",
      });
    }
  }

  return errors;
}

function repositoryManifestInvariants(
  value: RepositoryManifest,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  if (value.snapshot.kind !== "repository") {
    errors.push({
      instance_path: "/snapshot/kind",
      keyword: "snapshot_kind",
      message: "repository manifests must embed a repository snapshot",
    });
  }

  errors.push(
    ...validateArtifactDescriptors(value.artifacts, value.run_id, value.status),
    ...completionTimestampErrors(value),
  );

  const artifactByPath = new Map(value.artifacts.map((artifact) => [artifact.path, artifact]));
  const coverageArtifact = artifactByPath.get(value.coverage_file);
  const cardsArtifact = artifactByPath.get(value.cards_file);

  if (coverageArtifact?.kind !== "coverage" || coverageArtifact.state !== "complete") {
    errors.push({
      instance_path: "/coverage_file",
      keyword: "artifact_reference",
      message:
        "coverage_file must resolve to a complete coverage artifact in the manifest",
    });
  }

  if (
    cardsArtifact?.kind !== "behavior_cards" ||
    cardsArtifact.state !== "complete"
  ) {
    errors.push({
      instance_path: "/cards_file",
      keyword: "artifact_reference",
      message:
        "cards_file must resolve to a complete behavior_cards artifact in the manifest",
    });
  }

  return errors;
}

export function validateSnapshotIdentity(
  value: unknown,
): SchemaValidationResult<SnapshotIdentity> {
  return validateWithInvariants(snapshotIdentityValidator, value, [
    snapshotIdentityInvariants,
  ]);
}

export function validateCoverageEnvelope(
  value: unknown,
): SchemaValidationResult<CoverageEnvelope> {
  return validateWithInvariants(coverageEnvelopeValidator, value, [
    coverageEnvelopeInvariants,
  ]);
}

export function validateStagedReceipt(
  value: unknown,
): SchemaValidationResult<StagedReceipt> {
  return validateWithInvariants(stagedReceiptValidator, value, [
    stagedReceiptInvariants,
  ]);
}

export function validateRepositoryManifest(
  value: unknown,
): SchemaValidationResult<RepositoryManifest> {
  return validateWithInvariants(repositoryManifestValidator, value, [
    repositoryManifestInvariants,
  ]);
}
