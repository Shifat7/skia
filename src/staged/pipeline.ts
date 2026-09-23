import { Buffer } from "node:buffer";

import { resolveLanguageRegistration } from "../languages/registry.js";
import { MAX_STAGED_CHANGED_LINES } from "../limits.js";
import { validateRelativePath } from "../paths.js";
import type {
  CoverageEnvelope,
  CoverageEvent,
  CoverageEventId,
  GitCapturedBlob,
  GitRawSnapshotRecord,
  SnapshotEntry,
  StableErrorReason,
  StagedSnapshotCapture,
} from "../types.js";
import { analyzeLiteralGuardFunction } from "./analyze.js";
import type {
  PilotSupportedAnalysis,
  StagedPipelineResult,
} from "./types.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const HUNK_HEADER_PATTERN =
  /^@@ -([0-9]+)(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/;

interface PatchLineChanges {
  readonly stagedLines: readonly number[];
  readonly deletedLines: readonly number[];
}

interface MutablePatchLineChanges {
  readonly stagedLines: number[];
  readonly deletedLines: number[];
}

function patchPath(line: string, side: "a" | "b"): string | null {
  const value = line.slice(4);

  if (value === "/dev/null") {
    return null;
  }

  const decoded = value.startsWith("\"")
    ? decodeGitQuotedPath(value)
    : value;

  return decoded?.startsWith(`${side}/`) === true ? decoded.slice(2) : null;
}

function decodeGitQuotedPath(value: string): string | null {
  if (!value.endsWith("\"")) {
    return null;
  }

  const bytes: number[] = [];
  const body = value.slice(1, -1);

  for (let index = 0; index < body.length; ) {
    const codePoint = body.codePointAt(index);

    if (codePoint === undefined) {
      return null;
    }

    const character = String.fromCodePoint(codePoint);

    if (character !== "\\") {
      bytes.push(...Buffer.from(character, "utf8"));
      index += character.length;
      continue;
    }

    index += 1;
    const escaped = body[index];

    if (escaped === undefined) {
      return null;
    }

    const simpleEscapes: Readonly<Record<string, number>> = {
      "\\": 0x5c,
      "\"": 0x22,
      n: 0x0a,
      r: 0x0d,
      t: 0x09,
      b: 0x08,
      f: 0x0c,
      v: 0x0b,
      a: 0x07,
    };
    const simple = simpleEscapes[escaped];

    if (simple !== undefined) {
      bytes.push(simple);
      index += 1;
      continue;
    }

    if (!/[0-7]/.test(escaped)) {
      return null;
    }

    let octal = escaped;
    while (
      octal.length < 3 &&
      index + 1 < body.length &&
      /[0-7]/.test(body[index + 1] ?? "")
    ) {
      index += 1;
      octal += body[index];
    }
    bytes.push(Number.parseInt(octal, 8));
    index += 1;
  }

  try {
    return UTF8_DECODER.decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

export function changedLinesFromPatch(
  patchBytes: Uint8Array,
): ReadonlyMap<string, readonly number[]> {
  return new Map(
    [...lineChangesFromPatch(patchBytes)].map(([path, changes]) => [
      path,
      changes.stagedLines,
    ]),
  );
}

function decodePatchLine(lineBytes: Uint8Array): string {
  try {
    return UTF8_DECODER.decode(lineBytes);
  } catch {
    const prefix = lineBytes[0];
    if (prefix === 0x2b) {
      return "+";
    }
    if (prefix === 0x2d) {
      return "-";
    }
    if (prefix === 0x20) {
      return " ";
    }
    if (prefix === 0x5c) {
      return "\\ No newline at end of file";
    }
    return "\u0000";
  }
}

function patchTextLines(patchBytes: Uint8Array): readonly string[] {
  const lines: string[] = [];
  let start = 0;

  for (let index = 0; index <= patchBytes.length; index += 1) {
    if (index < patchBytes.length && patchBytes[index] !== 0x0a) {
      continue;
    }

    lines.push(decodePatchLine(patchBytes.subarray(start, index)));
    if (index === patchBytes.length) {
      break;
    }
    start = index + 1;
  }

  return lines;
}

function lineChangesFromPatch(
  patchBytes: Uint8Array,
): ReadonlyMap<string, PatchLineChanges> {
  const patchLines = patchTextLines(patchBytes);

  const changedByPath = new Map<string, MutablePatchLineChanges>();
  let basePath: string | null = null;
  let currentPath: string | null = null;
  let nextBaseLine: number | null = null;
  let nextStagedLine: number | null = null;

  for (const line of patchLines) {
    if (currentPath !== null && nextStagedLine !== null) {
      if (line.startsWith("+")) {
        changedByPath.get(currentPath)?.stagedLines.push(nextStagedLine);
        nextStagedLine += 1;
        continue;
      }

      if (line.startsWith("-")) {
        if (nextBaseLine !== null) {
          const changes = changedByPath.get(currentPath);
          changes?.deletedLines.push(nextBaseLine);
          nextBaseLine += 1;
        }
        continue;
      }

      if (line.startsWith(" ") || line === "") {
        if (nextBaseLine !== null) {
          nextBaseLine += 1;
        }
        nextStagedLine += 1;
        continue;
      }

      if (line === "\\ No newline at end of file") {
        continue;
      }

      nextStagedLine = null;
    }

    if (line.startsWith("diff --git ")) {
      basePath = null;
      currentPath = null;
      nextBaseLine = null;
      nextStagedLine = null;
      continue;
    }

    if (line.startsWith("--- ")) {
      basePath = patchPath(line, "a");
      continue;
    }

    if (line.startsWith("+++ ")) {
      currentPath = patchPath(line, "b") ?? basePath;
      nextBaseLine = null;
      nextStagedLine = null;

      if (currentPath !== null && !changedByPath.has(currentPath)) {
        changedByPath.set(currentPath, {
          stagedLines: [],
          deletedLines: [],
        });
      }
      continue;
    }

    const hunk = HUNK_HEADER_PATTERN.exec(line);
    if (hunk !== null) {
      nextBaseLine =
        currentPath !== null && hunk[1] !== undefined
          ? Number.parseInt(hunk[1], 10)
          : null;
      nextStagedLine =
        currentPath !== null && hunk[2] !== undefined
          ? Number.parseInt(hunk[2], 10)
          : null;
      continue;
    }

  }

  return new Map(
    [...changedByPath.entries()]
      .filter(([, changes]) =>
        changes.stagedLines.length > 0 || changes.deletedLines.length > 0
      )
      .map(([path, changes]) => [
        path,
        {
          stagedLines: [...new Set(changes.stagedLines)].sort((a, b) => a - b),
          deletedLines: [...new Set(changes.deletedLines)].sort((a, b) => a - b),
        },
      ]),
  );
}

function stagedBlob(
  entry: SnapshotEntry,
  capturedBlobs: readonly GitCapturedBlob[],
): GitCapturedBlob | null {
  if (entry.snapshot_blob_oid === null) {
    return null;
  }

  return (
    capturedBlobs.find((blob) => blob.oid === entry.snapshot_blob_oid) ?? null
  );
}

function supportedCoverage(
  analysis: PilotSupportedAnalysis,
  changedLines: readonly number[],
  deletedLines: readonly number[],
): CoverageEnvelope {
  const uniqueChangedLines = [...new Set(changedLines)];
  const mappedLines = uniqueChangedLines.filter((line) =>
    analysis.evidence.anchors.some(
      (anchor) => line >= anchor.start_line && line <= anchor.end_line,
    )
  );
  const unmappedLines =
    uniqueChangedLines.length - mappedLines.length + deletedLines.length;
  const events: CoverageEvent[] = [];

  if (mappedLines.length > 0) {
    events.push({
      id: `staged:${analysis.entity.id}:supported` as CoverageEventId,
      coverage: "supported",
      units: mappedLines.length,
      reason: null,
      path: analysis.entity.anchor.path,
      language: "typescript",
      anchors: analysis.evidence.anchors,
    });
  }

  if (unmappedLines > 0) {
    events.push({
      id: `staged:${analysis.entity.id}:unmapped` as CoverageEventId,
      coverage: "unmapped",
      units: unmappedLines,
      reason: "unmapped_region",
      path: analysis.entity.anchor.path,
      language: "typescript",
      anchors: [],
    });
  }

  return {
    summary: {
      total_units: uniqueChangedLines.length + deletedLines.length,
      supported_units: mappedLines.length,
      partial_units: 0,
      unmapped_units: unmappedLines,
      unsupported_units: 0,
      excluded_units: 0,
      failed_units: 0,
      unchecked_units: 0,
    },
    events,
  };
}

function failedCoverage(
  entry: SnapshotEntry,
  reason:
    | "binary_source"
    | "invalid_source_encoding"
    | "parse_failed"
    | "parse_timeout",
  units: number,
): CoverageEnvelope {
  const failedUnits = Math.max(1, units);

  return {
    summary: {
      total_units: failedUnits,
      supported_units: 0,
      partial_units: 0,
      unmapped_units: 0,
      unsupported_units: 0,
      excluded_units: 0,
      failed_units: failedUnits,
      unchecked_units: 0,
    },
    events: [
      {
        id: `staged:${entry.path}:failed` as CoverageEventId,
        coverage: "failed",
        units: failedUnits,
        reason,
        path: entry.path,
        language: "typescript",
        anchors: [],
      },
    ],
  };
}

function unsupportedCoverage(
  reason: StableErrorReason,
  units: number,
  entry?: {
    readonly path: SnapshotEntry["path"];
    readonly language: SnapshotEntry["language"];
  },
): CoverageEnvelope {
  const coverage =
    reason === "unmapped_region"
      ? "unmapped"
      : reason === "syntax_error"
        ? "partial"
        : "unsupported";

  return {
    summary: {
      total_units: units,
      supported_units: 0,
      partial_units: coverage === "partial" ? units : 0,
      unmapped_units: coverage === "unmapped" ? units : 0,
      unsupported_units: coverage === "unsupported" ? units : 0,
      excluded_units: 0,
      failed_units: 0,
      unchecked_units: 0,
    },
    events: units === 0
      ? []
      : [
          {
            id: `staged:${entry?.path ?? "snapshot"}:${coverage}` as CoverageEventId,
            coverage,
            units,
            reason,
            path: entry?.path ?? null,
            language: entry?.language ?? null,
            anchors: [],
          },
        ],
  };
}

function rawRecordCoverageIdentity(
  record: GitRawSnapshotRecord,
): {
  readonly path: SnapshotEntry["path"];
  readonly language: SnapshotEntry["language"];
} | undefined {
  const candidates = [record.path_bytes, record.previous_path_bytes];

  for (const candidate of candidates) {
    if (candidate === null) {
      continue;
    }

    try {
      const relativePath = validateRelativePath(UTF8_DECODER.decode(candidate));
      const language = resolveLanguageRegistration(relativePath)?.language ?? null;

      if (language !== null) {
        return {
          path: relativePath,
          language,
        };
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function isSupportedLanguageRecord(record: GitRawSnapshotRecord): boolean {
  let recordPath: string;

  try {
    recordPath = UTF8_DECODER.decode(record.path_bytes);
  } catch {
    return false;
  }

  return resolveLanguageRegistration(recordPath) !== null;
}

function recordChangedUnits(
  record: GitRawSnapshotRecord,
  patchChanges: ReadonlyMap<string, PatchLineChanges>,
): number {
  let recordPath: string;

  try {
    recordPath = UTF8_DECODER.decode(record.path_bytes);
  } catch {
    return 1;
  }

  const changes = patchChanges.get(recordPath);
  const units =
    (changes?.stagedLines.length ?? 0) + (changes?.deletedLines.length ?? 0);
  return units > 0 ? units : 1;
}

export function analyzeCapturedStagedSnapshot(
  capture: StagedSnapshotCapture,
): StagedPipelineResult {
  const patchChanges = lineChangesFromPatch(capture.patch_bytes);
  const capturedUnits = capture.raw_records.reduce(
    (total, record) => total + recordChangedUnits(record, patchChanges),
    0,
  );
  const budgetUnits = capture.raw_records.reduce(
    (total, record) =>
      isSupportedLanguageRecord(record)
        ? total + recordChangedUnits(record, patchChanges)
        : total,
    0,
  );
  const entries = capture.identity.entries.filter(
    (entry) => entry.language === "typescript",
  );
  const soleCapturedEntry = capture.identity.entries.length === 1
    ? capture.identity.entries[0]
    : undefined;
  const soleRawRecord = capture.raw_records.length === 1
    ? capture.raw_records[0]
    : undefined;
  const soleRecordIdentity = soleRawRecord === undefined
    ? undefined
    : rawRecordCoverageIdentity(soleRawRecord);
  const soleCoverageIdentity = soleCapturedEntry ?? soleRecordIdentity;

  if (budgetUnits > MAX_STAGED_CHANGED_LINES) {
    return {
      kind: "unsupported",
      reason: "staged_budget_exceeded",
      coverage: unsupportedCoverage(
        "staged_budget_exceeded",
        capturedUnits,
        capture.raw_records.length === 1
          ? (entries[0] ?? soleCoverageIdentity)
          : undefined,
      ),
    };
  }

  if (capture.raw_records.length !== 1 || entries.length !== 1) {
    return {
      kind: "unsupported",
      reason: "no_supported_staged_entity",
      coverage: unsupportedCoverage(
        "no_supported_staged_entity",
        capturedUnits,
        capture.raw_records.length === 1 ? soleCoverageIdentity : undefined,
      ),
    };
  }

  const entry = entries[0];
  if (entry === undefined) {
    return {
      kind: "unsupported",
      reason: "no_supported_staged_entity",
      coverage: unsupportedCoverage(
        "no_supported_staged_entity",
        capturedUnits,
      ),
    };
  }

  const blob = stagedBlob(entry, capture.captured_blobs);
  if (blob === null) {
    return {
      kind: "unsupported",
      reason: "missing_local_object",
      coverage: unsupportedCoverage(
        "missing_local_object",
        capturedUnits,
        entry,
      ),
    };
  }

  let source: string;
  if (blob.bytes.includes(0)) {
    return {
      kind: "failed",
      reason: "binary_source",
      coverage: failedCoverage(entry, "binary_source", capturedUnits),
    };
  }

  try {
    source = UTF8_DECODER.decode(blob.bytes);
  } catch {
    return {
      kind: "failed",
      reason: "invalid_source_encoding",
      coverage: failedCoverage(entry, "invalid_source_encoding", capturedUnits),
    };
  }

  const lineChanges = patchChanges.get(entry.path);
  const changedLines = lineChanges?.stagedLines ?? [];
  const deletedLines = lineChanges?.deletedLines ?? [];
  const changedUnitCount = changedLines.length + deletedLines.length;

  if (changedUnitCount === 0 && capture.raw_records.length > 0) {
    return {
      kind: "unsupported",
      reason: "no_supported_staged_entity",
      coverage: unsupportedCoverage(
        "no_supported_staged_entity",
        capturedUnits,
        entry,
      ),
    };
  }

  const baseBlob = entry.base_blob_oid === null
    ? null
    : capture.captured_blobs.find((candidate) => candidate.oid === entry.base_blob_oid) ??
      null;
  let baseSource: string | null = null;
  if (baseBlob !== null && !baseBlob.bytes.includes(0)) {
    try {
      baseSource = UTF8_DECODER.decode(baseBlob.bytes);
    } catch {
      baseSource = null;
    }
  }

  const analysis = analyzeLiteralGuardFunction({
    base_source: baseSource,
    blob_oid: blob.oid,
    changed_lines: changedLines,
    path: entry.path,
    source,
  });

  if (analysis.kind === "failed") {
    return {
      ...analysis,
      coverage: failedCoverage(
        entry,
        analysis.reason,
        changedLines.length + deletedLines.length,
      ),
    };
  }

  if (analysis.kind !== "supported") {
    return {
      ...analysis,
      coverage: unsupportedCoverage(
        analysis.reason,
        changedUnitCount,
        entry,
      ),
    };
  }

  return {
    kind: "supported",
    snapshot: capture.identity,
    analysis,
    changed_lines: changedLines,
    deleted_lines: deletedLines,
    coverage: supportedCoverage(analysis, changedLines, deletedLines),
  };
}
