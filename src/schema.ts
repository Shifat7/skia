import {
  Ajv2020,
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { isDeepStrictEqual } from "node:util";

import { repositoryManifestSchema } from "../schemas/repository-manifest.js";
import { snapshotIdentitySchema } from "../schemas/snapshot-identity.js";
import { stagedReceiptSchema } from "../schemas/staged-receipt.js";
import {
  coverageEnvelopeSchema,
  RFC3339_UTC_PATTERN,
} from "../schemas/shared.js";
import {
  deriveRepositoryArtifactPath,
  deriveStagedArtifactPath,
  deriveStagedReceiptPath,
} from "./paths.js";
import type {
  ArtifactDescriptor,
  ArtifactHashRecord,
  CoverageEnvelope,
  CoverageEvent,
  CoverageState,
  GitObjectId,
  RepositoryManifest,
  SnapshotEntry,
  SnapshotIdentity,
  SessionId,
  ManifestArtifactKind,
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

function runIdToRfc3339Utc(value: string): string {
  return (
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
    `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
  );
}

function runIdCalendarErrors(
  runId: string,
): readonly SchemaValidationError[] {
  if (validRfc3339Utc(runIdToRfc3339Utc(runId))) {
    return [];
  }

  return [
    {
      instance_path: "/run_id",
      keyword: "run_id_calendar",
      message: "run_id must be a real UTC calendar timestamp",
    },
  ];
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

interface AggregatedUnits {
  readonly totals: Readonly<Record<CoverageState, number>>;
  readonly overflowed: boolean;
}

function aggregateUnits(
  events: readonly CoverageEvent[],
): AggregatedUnits {
  const totals: Record<CoverageState, number> = {
    supported: 0,
    partial: 0,
    unmapped: 0,
    unsupported: 0,
    excluded: 0,
    failed: 0,
    unchecked: 0,
  };

  let overflowed = false;

  for (const event of events) {
    const next = safeAddUnits(totals[event.coverage], event.units);
    if (next === null) {
      overflowed = true;
      continue;
    }

    totals[event.coverage] = next;
  }

  return { totals, overflowed };
}

function safeAddUnits(left: number, right: number): number | null {
  const total = left + right;
  return Number.isSafeInteger(total) ? total : null;
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
    if (
      (value.checkout.state === "branch" && value.checkout.branch_name === null) ||
      (value.checkout.state === "detached" && value.checkout.branch_name !== null)
    ) {
      errors.push({
        instance_path: "/checkout",
        keyword: "checkout_identity",
        message:
          value.checkout.state === "branch"
            ? "branch checkout must include a branch_name"
            : "detached checkout must have a null branch_name",
      });
    }
  }

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

  const objectIds: GitObjectId[] = [];
  if (value.kind === "repository") {
    objectIds.push(value.commit_oid);
  } else if (value.base_commit !== null) {
    objectIds.push(value.base_commit);
  }

  for (const entry of value.entries) {
    if (entry.base_blob_oid !== null) {
      objectIds.push(entry.base_blob_oid);
    }
    if (entry.snapshot_blob_oid !== null) {
      objectIds.push(entry.snapshot_blob_oid);
    }
  }

  const objectIdLengths = objectIds.map((oid) => oid.length);

  if (new Set(objectIdLengths).size > 1) {
    errors.push({
      instance_path: "/entries",
      keyword: "object_format",
      message: "snapshot Git object IDs must use one object format",
    });
  }

  return errors;
}

function coverageEnvelopeInvariants(
  value: CoverageEnvelope,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const aggregate = aggregateUnits(value.events);
  const units = aggregate.totals;
  let totalFromEvents: number | null = 0;

  for (const unitCount of Object.values(units)) {
    totalFromEvents =
      totalFromEvents === null ? null : safeAddUnits(totalFromEvents, unitCount);
  }

  if (aggregate.overflowed || totalFromEvents === null) {
    errors.push({
      instance_path: "/summary",
      keyword: "coverage_arithmetic",
      message:
        "coverage event unit aggregates must not exceed Number.MAX_SAFE_INTEGER",
    });
  }

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

  if (
    totalFromEvents !== null &&
    value.summary.total_units !== totalFromEvents
  ) {
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
  sessionId: SessionId,
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
    const expectedPath = artifact.kind === "receipt"
      ? deriveStagedReceiptPath(runId as StagedReceipt["run_id"], sessionId)
      : deriveStagedArtifactPath(
        runId as StagedReceipt["run_id"],
        sessionId,
        artifact.kind,
      );

    if (artifact.path !== expectedPath) {
      errors.push({
        instance_path: `/artifact_hashes/${index}/path`,
        keyword: "canonical_staged_artifact_path",
        message:
          "staged artifact hash paths must use the canonical staged artifact path for the run_id, session_id, and kind",
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
    ...runIdCalendarErrors(value.run_id),
    ...completionTimestampErrors(value),
    ...coverageEnvelopeInvariants(value.coverage),
    ...validateStagedCoverageAnchors(value.snapshot.entries, value.coverage),
    ...validateArtifactHashes(value.artifact_hashes, value.run_id, value.session_id),
    ...validateStagedReview(value),
  ];
}

function stagedAnchorBound(
  entries: readonly SnapshotEntry[],
  anchor: SourceAnchor,
): boolean {
  const entry = entries.find((candidate) => candidate.path === anchor.path);
  const expectedBlob =
    anchor.side === "base"
      ? entry?.base_blob_oid
      : anchor.side === "staged"
        ? entry?.snapshot_blob_oid
        : null;

  return (
    entry !== undefined &&
    anchor.side !== "repository" &&
    entry.language === anchor.language &&
    expectedBlob !== null &&
    expectedBlob === anchor.blob_oid
  );
}

function validateStagedReview(
  value: StagedReceipt,
): readonly SchemaValidationError[] {
  const review = value.review;

  if (review === undefined) {
    return [];
  }

  const errors: SchemaValidationError[] = [];
  const prediction = review.entity.prediction;
  const sourceCheck = review.entity.source_check;

  if (review.card_status === "complete") {
    if (prediction === null || sourceCheck === null) {
      errors.push({
        instance_path: "/review/entity",
        keyword: "completed_card",
        message:
          "complete staged review cards require a persisted prediction and source check",
      });
    }

    if (
      review.session_counts.predictions_completed !== 1 ||
      review.session_counts.skips !== 0
    ) {
      errors.push({
        instance_path: "/review/session_counts",
        keyword: "completed_card_counts",
        message:
          "complete staged review cards require one completed prediction and zero skips",
      });
    }
  } else if (
    prediction !== null ||
    sourceCheck !== null ||
    review.session_counts.predictions_completed !== 0 ||
    review.session_counts.skips !== 1
  ) {
    errors.push({
      instance_path: "/review",
      keyword: "skipped_card",
      message:
        "skipped staged review cards require no prediction or source check and exactly one skip",
    });
  }

  if (
    prediction !== null &&
    !isDeepStrictEqual(prediction.scenario, review.entity.scenario)
  ) {
    errors.push({
      instance_path: "/review/entity/prediction/scenario",
      keyword: "scenario_identity",
      message:
        "persisted prediction scenario must match the staged review entity scenario",
    });
  }

  if (
    prediction !== null &&
    sourceCheck !== null &&
    !isDeepStrictEqual(sourceCheck.predicted, prediction.prediction.value)
  ) {
    errors.push({
      instance_path: "/review/entity/source_check/predicted",
      keyword: "prediction_identity",
      message:
        "source check predicted value must match the persisted prediction value",
    });
  }

  if (sourceCheck !== null) {
    const valuesMatch = isDeepStrictEqual(
      sourceCheck.expected,
      sourceCheck.predicted,
    );
    const statusMatches =
      (valuesMatch && sourceCheck.status === "source_derived_match") ||
      (!valuesMatch && sourceCheck.status === "source_derived_mismatch");

    if (!statusMatches) {
      errors.push({
        instance_path: "/review/entity/source_check/status",
        keyword: "source_check_status",
        message:
          "source check status must reflect equality of expected and predicted values",
      });
    }
  }

  const reviewAnchors = [
    review.entity.anchor,
    ...review.entity.evidence.anchors,
  ];

  for (const [index, anchor] of reviewAnchors.entries()) {
    if (!stagedAnchorBound(value.snapshot.entries, anchor)) {
      errors.push({
        instance_path: `/review/entity/anchors/${index}`,
        keyword: "staged_anchor_binding",
        message:
          "staged review anchors must match a staged snapshot entry by path, language, side, and blob_oid",
      });
    }
  }

  const behaviorCardArtifacts = value.artifact_hashes.filter(
    (artifact) => artifact.kind === "behavior_cards",
  );

  if (behaviorCardArtifacts.length !== 1) {
    errors.push({
      instance_path: "/artifact_hashes",
      keyword: "review_artifacts",
      message:
        "staged review receipts require exactly one behavior_cards artifact hash",
    });
  }

  return errors;
}

function validateStagedCoverageAnchors(
  snapshotEntries: readonly SnapshotEntry[],
  coverage: CoverageEnvelope,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const snapshotEntryByPath = new Map(
    snapshotEntries.map((entry) => [entry.path, entry]),
  );

  for (const [eventIndex, event] of coverage.events.entries()) {
    for (const [anchorIndex, anchor] of event.anchors.entries()) {
      const snapshotEntry = snapshotEntryByPath.get(anchor.path);
      const expectedBlob = anchor.side === "base"
        ? snapshotEntry?.base_blob_oid
        : anchor.side === "staged"
          ? snapshotEntry?.snapshot_blob_oid
          : null;

      if (
        snapshotEntry === undefined ||
        anchor.side === "repository" ||
        snapshotEntry.language !== anchor.language ||
        expectedBlob === null ||
        expectedBlob !== anchor.blob_oid
      ) {
        errors.push({
          instance_path: `/coverage/events/${eventIndex}/anchors/${anchorIndex}`,
          keyword: "staged_anchor_binding",
          message:
            "coverage source anchors must match a staged snapshot entry by path, language, side, and blob_oid",
        });
      }
    }
  }

  return errors;
}

function expectedArtifactPath(kind: ManifestArtifactKind, runId: string): string {
  return deriveRepositoryArtifactPath(runId as RepositoryManifest["run_id"], kind);
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
    if (artifact.path !== expectedArtifactPath(artifact.kind, runId)) {
      errors.push({
        instance_path: `/artifacts/${index}/path`,
        keyword: "canonical_artifact_path",
        message:
          "manifest artifact path must be the canonical path for its kind and run_id",
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

function validateRepositoryCoverageAnchors(
  snapshotEntries: readonly SnapshotEntry[],
  coverage: CoverageEnvelope,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const snapshotEntryByPath = new Map(
    snapshotEntries.map((entry) => [entry.path, entry]),
  );

  for (const [eventIndex, event] of coverage.events.entries()) {
    for (const [anchorIndex, anchor] of event.anchors.entries()) {
      const snapshotEntry = snapshotEntryByPath.get(anchor.path);

      if (
        anchor.side !== "repository" ||
        snapshotEntry === undefined ||
        snapshotEntry.language !== anchor.language ||
        snapshotEntry.snapshot_blob_oid !== anchor.blob_oid
      ) {
        errors.push({
          instance_path: `/coverage/events/${eventIndex}/anchors/${anchorIndex}`,
          keyword: "repository_anchor_binding",
          message:
            "coverage source anchors must match a repository snapshot entry by path, language, side, and blob_oid",
        });
      }
    }
  }

  return errors;
}

function repositoryManifestInvariants(
  value: RepositoryManifest,
): readonly SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  if (value.status === "incomplete") {
    errors.push({
      instance_path: "/status",
      keyword: "terminal_manifest",
      message: "repository manifests must be terminal with complete or partial status",
    });
  }

  if (value.snapshot.kind !== "repository") {
    errors.push({
      instance_path: "/snapshot/kind",
      keyword: "snapshot_kind",
      message: "repository manifests must embed a repository snapshot",
    });
  }

  errors.push(
    ...runIdCalendarErrors(value.run_id),
    ...validateArtifactDescriptors(value.artifacts, value.run_id, value.status),
    ...validateRepositoryCoverageAnchors(value.snapshot.entries, value.coverage),
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
