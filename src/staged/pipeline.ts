import { Buffer } from "node:buffer";

import type {
  CoverageEnvelope,
  CoverageEvent,
  CoverageEventId,
  GitCapturedBlob,
  SnapshotEntry,
  StagedSnapshotCapture,
} from "../types.js";
import { analyzeLiteralGuardFunction } from "./analyze.js";
import type {
  PilotSupportedAnalysis,
  StagedPipelineResult,
} from "./types.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const HUNK_HEADER_PATTERN =
  /^@@ -[0-9]+(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/;

function patchPath(line: string): string | null {
  const value = line.slice(4);

  if (value === "/dev/null") {
    return null;
  }

  const decoded = value.startsWith("\"")
    ? decodeGitQuotedPath(value)
    : value;

  return decoded?.startsWith("b/") === true ? decoded.slice(2) : null;
}

function decodeGitQuotedPath(value: string): string | null {
  if (!value.endsWith("\"")) {
    return null;
  }

  const bytes: number[] = [];

  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];

    if (character !== "\\") {
      bytes.push(...Buffer.from(character ?? "", "utf8"));
      continue;
    }

    index += 1;
    const escaped = value[index];

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
      continue;
    }

    if (!/[0-7]/.test(escaped)) {
      return null;
    }

    let octal = escaped;
    while (
      octal.length < 3 &&
      index + 1 < value.length - 1 &&
      /[0-7]/.test(value[index + 1] ?? "")
    ) {
      index += 1;
      octal += value[index];
    }
    bytes.push(Number.parseInt(octal, 8));
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
  let patch: string;

  try {
    patch = UTF8_DECODER.decode(patchBytes);
  } catch {
    return new Map();
  }

  const changedByPath = new Map<string, number[]>();
  let currentPath: string | null = null;
  let nextStagedLine: number | null = null;

  for (const line of patch.split("\n")) {
    if (currentPath !== null && nextStagedLine !== null) {
      if (line.startsWith("+")) {
        changedByPath.get(currentPath)?.push(nextStagedLine);
        nextStagedLine += 1;
        continue;
      }

      if (line.startsWith("-")) {
        continue;
      }

      if (line.startsWith(" ")) {
        nextStagedLine += 1;
        continue;
      }

      if (line === "\\ No newline at end of file") {
        continue;
      }

      nextStagedLine = null;
    }

    if (line.startsWith("diff --git ")) {
      currentPath = null;
      nextStagedLine = null;
      continue;
    }

    if (line.startsWith("+++ ")) {
      currentPath = patchPath(line);
      nextStagedLine = null;

      if (currentPath !== null && !changedByPath.has(currentPath)) {
        changedByPath.set(currentPath, []);
      }
      continue;
    }

    const hunk = HUNK_HEADER_PATTERN.exec(line);
    if (hunk !== null) {
      nextStagedLine =
        currentPath !== null && hunk[1] !== undefined
          ? Number.parseInt(hunk[1], 10)
          : null;
      continue;
    }

  }

  return new Map(
    [...changedByPath.entries()]
      .filter(([, lines]) => lines.length > 0)
      .map(([path, lines]) => [path, [...new Set(lines)].sort((a, b) => a - b)]),
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
): CoverageEnvelope {
  const uniqueChangedLines = [...new Set(changedLines)];
  const mappedLines = uniqueChangedLines.filter((line) =>
    analysis.evidence.anchors.some(
      (anchor) => line >= anchor.start_line && line <= anchor.end_line,
    )
  );
  const unmappedLines = uniqueChangedLines.length - mappedLines.length;
  const events: CoverageEvent[] = [
    {
      id: `staged:${analysis.entity.id}:supported` as CoverageEventId,
      coverage: "supported",
      units: mappedLines.length,
      reason: null,
      path: analysis.entity.anchor.path,
      language: "typescript",
      anchors: analysis.evidence.anchors,
    },
  ];

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
      total_units: uniqueChangedLines.length,
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

export function analyzeCapturedStagedSnapshot(
  capture: StagedSnapshotCapture,
): StagedPipelineResult {
  const entries = capture.identity.entries.filter(
    (entry) => entry.language === "typescript",
  );

  if (capture.raw_records.length !== 1 || entries.length !== 1) {
    return {
      kind: "unsupported",
      reason: "no_supported_staged_entity",
    };
  }

  const entry = entries[0];
  if (entry === undefined) {
    return {
      kind: "unsupported",
      reason: "no_supported_staged_entity",
    };
  }

  const blob = stagedBlob(entry, capture.captured_blobs);
  if (blob === null) {
    return {
      kind: "unsupported",
      reason: "missing_local_object",
    };
  }

  let source: string;
  if (blob.bytes.includes(0)) {
    return {
      kind: "unsupported",
      reason: "binary_source",
    };
  }

  try {
    source = UTF8_DECODER.decode(blob.bytes);
  } catch {
    return {
      kind: "unsupported",
      reason: "invalid_source_encoding",
    };
  }

  const changedLines =
    changedLinesFromPatch(capture.patch_bytes).get(entry.path) ?? [];
  const analysis = analyzeLiteralGuardFunction({
    blob_oid: blob.oid,
    changed_lines: changedLines,
    path: entry.path,
    source,
  });

  if (analysis.kind !== "supported") {
    return analysis;
  }

  return {
    kind: "supported",
    snapshot: capture.identity,
    analysis,
    changed_lines: changedLines,
    coverage: supportedCoverage(analysis, changedLines),
  };
}
