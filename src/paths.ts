import { Buffer } from "node:buffer";
import path from "node:path";

import type {
  ManifestArtifactKind,
  RepositoryRelativePath,
  RunArtifactPath,
  RunId,
  SessionId,
} from "./types.js";

const RUN_ID_PATTERN = /^[0-9]{8}T[0-9]{6}Z(?:-[0-9]{2})?$/;
const SESSION_ID_PATTERN = /^[a-z0-9]{8,32}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export interface InternalPath {
  readonly bytes: Uint8Array;
  readonly display: string;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function assertFiniteInstant(instant: Date): void {
  if (!Number.isFinite(instant.getTime())) {
    throw new Error("run ID creation requires a finite UTC timestamp");
  }
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function isControlByte(byte: number): boolean {
  return byte < 0x20 || byte === 0x7f;
}

function isSafeDisplayCodeUnit(codeUnit: number): boolean {
  return !isControlByte(codeUnit) && codeUnit !== 0x22 && codeUnit !== 0x5c;
}

export function escapePathForDisplay(value: string | Uint8Array): string {
  if (typeof value !== "string") {
    let escaped = "\"";

    for (const byte of value) {
      if (byte === 0x22) {
        escaped += "\\\"";
        continue;
      }

      if (byte === 0x5c) {
        escaped += "\\\\";
        continue;
      }

      escaped += isControlByte(byte) ? `\\x${toHex(byte)}` : String.fromCharCode(byte);
    }

    return `${escaped}"`;
  }

  let escaped = "\"";

  for (const character of value) {
    const codeUnit = character.charCodeAt(0);

    if (character === "\"") {
      escaped += "\\\"";
      continue;
    }

    if (character === "\\") {
      escaped += "\\\\";
      continue;
    }

    escaped += isSafeDisplayCodeUnit(codeUnit) ? character : `\\x${toHex(codeUnit)}`;
  }

  return `${escaped}"`;
}

export function createInternalPath(value: string | Uint8Array): InternalPath {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);

  return {
    bytes,
    display: escapePathForDisplay(value),
  };
}

function invalidRelativePath(value: string, reason: string): never {
  throw new Error(`invalid relative path ${escapePathForDisplay(value)}: ${reason}`);
}

export function validateRelativePath(value: string): RepositoryRelativePath {
  if (value.length === 0) {
    invalidRelativePath(value, "path must not be empty");
  }

  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    invalidRelativePath(value, "path must not contain NUL or control characters");
  }

  if (value.includes("\\")) {
    invalidRelativePath(value, "path must use forward-slash separators only");
  }

  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    invalidRelativePath(value, "path must be repository-relative");
  }

  if (path.posix.normalize(value) !== value) {
    invalidRelativePath(value, "path must not require normalization");
  }

  const segments = value.split("/");

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    invalidRelativePath(value, "path must not contain empty, current-directory, or parent-directory segments");
  }

  return value as RepositoryRelativePath;
}

export function validateRunArtifactPath(value: string): RunArtifactPath {
  return validateRelativePath(value) as unknown as RunArtifactPath;
}

export function validateRunId(value: string): RunId {
  if (!RUN_ID_PATTERN.test(value)) {
    throw new Error(`invalid run ID ${escapePathForDisplay(value)}`);
  }

  const timestamp =
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
    `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  const parsedTimestamp = new Date(timestamp);

  if (
    !Number.isFinite(parsedTimestamp.getTime()) ||
    parsedTimestamp.toISOString().replace(".000Z", "Z") !== timestamp
  ) {
    throw new Error(`invalid run ID ${escapePathForDisplay(value)}: timestamp is not a real UTC instant`);
  }

  return value as RunId;
}

export function validateSessionId(value: string): SessionId {
  if (!SESSION_ID_PATTERN.test(value)) {
    throw new Error(`invalid session ID ${escapePathForDisplay(value)}`);
  }

  return value as SessionId;
}

export function formatRunIdAtUtc(instant: Date, suffix?: number): RunId {
  assertFiniteInstant(instant);

  const base =
    `${instant.getUTCFullYear()}${pad2(instant.getUTCMonth() + 1)}${pad2(instant.getUTCDate())}` +
    `T${pad2(instant.getUTCHours())}${pad2(instant.getUTCMinutes())}${pad2(instant.getUTCSeconds())}Z`;

  if (suffix === undefined) {
    return validateRunId(base);
  }

  if (!Number.isInteger(suffix) || suffix < 1 || suffix > 99) {
    throw new Error(`invalid run ID collision suffix ${suffix}`);
  }

  return validateRunId(`${base}-${pad2(suffix)}`);
}

export function createdAtFromRunId(runId: RunId): string {
  const value = validateRunId(runId);

  return (
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
    `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
  );
}

export function deriveRepositoryRunDirectory(runId: RunId): RepositoryRelativePath {
  return validateRelativePath(`dist/${runId}`) as RepositoryRelativePath;
}

export function deriveRepositoryArtifactPath(
  runId: RunId,
  kind: ManifestArtifactKind,
): RunArtifactPath {
  const filenameByKind: Readonly<Record<ManifestArtifactKind, string>> = {
    hld: `repo-hld-${runId}.md`,
    lld: `repo-lld-${runId}.md`,
    collapsed_evidence: `repo-collapsed-evidence-${runId}.md`,
    behavior_cards: `repo-behavior-cards-${runId}.json`,
    coverage: `repo-coverage-${runId}.json`,
  };

  return validateRunArtifactPath(filenameByKind[kind]);
}

export function deriveRepositoryManifestPath(runId: RunId): RunArtifactPath {
  return validateRunArtifactPath(`repo-manifest-${runId}.json`);
}

export function deriveStagedReceiptPath(
  runId: RunId,
  sessionId: SessionId,
): RunArtifactPath {
  return validateRunArtifactPath(`receipts/${runId}-${sessionId}-session.json`);
}
