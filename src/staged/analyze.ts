import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { MAX_STAGED_TEXT_CHARACTERS } from "../limits.js";
import type { SourceAnchor } from "../types.js";
import type {
  AnalyzeLiteralGuardFunctionOptions,
  JsonScalar,
  PilotAnalysis,
  PilotParserNodeRange,
  PilotParserResponse,
  PilotParserSuccess,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 1_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const PARSER_CHILD_PATH = fileURLToPath(
  new URL("./parser-child.js", import.meta.url),
);
const NODE_EXECUTABLE = (process as unknown as {
  readonly execPath?: string;
}).execPath ?? "node";

function isJsonScalar(value: unknown): value is JsonScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isRange(value: unknown): value is PilotParserNodeRange {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const range = value as Partial<PilotParserNodeRange>;
  return (
    Number.isSafeInteger(range.start_line) &&
    Number.isSafeInteger(range.start_column) &&
    Number.isSafeInteger(range.end_line) &&
    Number.isSafeInteger(range.end_column) &&
    (range.start_line ?? 0) >= 1 &&
    (range.start_column ?? -1) >= 0 &&
    (range.end_line ?? 0) >= (range.start_line ?? 1) &&
    (range.end_column ?? -1) >= 0
  );
}

function isParserSuccess(value: unknown): value is PilotParserSuccess {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<PilotParserSuccess>;
  return (
    response.kind === "supported" &&
    typeof response.entity_name === "string" &&
    typeof response.parameter_name === "string" &&
    typeof response.guard_text === "string" &&
    isJsonScalar(response.guard_value) &&
    typeof response.return_text === "string" &&
    isJsonScalar(response.return_value) &&
    typeof response.invocation === "string" &&
    isRange(response.entity_range) &&
    isRange(response.guard_range) &&
    isRange(response.return_range)
  );
}

function parseResponse(stdout: string): PilotParserResponse | null {
  try {
    const value = JSON.parse(stdout) as unknown;

    if (isParserSuccess(value)) {
      return value;
    }

    if (
      value !== null &&
      typeof value === "object" &&
      (value as { readonly kind?: unknown }).kind === "failed" &&
      (value as { readonly reason?: unknown }).reason === "parse_failed"
    ) {
      return {
        kind: "failed",
        reason: "parse_failed",
      };
    }

    if (
      value !== null &&
      typeof value === "object" &&
      (value as { readonly kind?: unknown }).kind === "unsupported"
    ) {
      return (value as { readonly reason?: unknown }).reason === "syntax_error"
        ? { kind: "unsupported", reason: "syntax_error" }
        : { kind: "unsupported" };
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  return timeoutMs === undefined || !Number.isFinite(timeoutMs)
    ? DEFAULT_TIMEOUT_MS
    : Math.max(1, Math.floor(timeoutMs));
}

function parsePilotSource(
  options: {
    readonly source: string;
    readonly parser_command?: AnalyzeLiteralGuardFunctionOptions["parser_command"];
    readonly timeout_ms?: number;
  },
): PilotParserResponse | "parse_failed" | "parse_timeout" {
  const command = options.parser_command ?? {
    command: NODE_EXECUTABLE,
    args: [PARSER_CHILD_PATH],
  };
  const result = spawnSync(command.command, command.args, {
    encoding: "utf8",
    input: JSON.stringify({ source: options.source }),
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: false,
    timeout: normalizeTimeout(options.timeout_ms),
  });

  if (
    result.error instanceof Error &&
    "code" in result.error &&
    result.error.code === "ETIMEDOUT"
  ) {
    return "parse_timeout";
  }

  if (
    result.error !== undefined ||
    result.status !== 0 ||
    result.signal !== null
  ) {
    return "parse_failed";
  }

  return parseResponse(String(result.stdout)) ?? "parse_failed";
}

function anchor(
  options: AnalyzeLiteralGuardFunctionOptions,
  range: PilotParserNodeRange,
): SourceAnchor {
  return {
    side: "staged",
    path: options.path,
    blob_oid: options.blob_oid,
    language: "typescript",
    start_line: range.start_line,
    start_column: range.start_column,
    end_line: range.end_line,
    end_column: range.end_column,
  };
}

function rangeFitsSource(
  range: PilotParserNodeRange,
  lines: readonly Uint8Array[],
): boolean {
  if (range.start_line < 1 || range.end_line > lines.length) {
    return false;
  }

  const first = lines[range.start_line - 1];
  const last = lines[range.end_line - 1];
  return first !== undefined &&
    last !== undefined &&
    range.start_column <= first.length &&
    range.end_column <= last.length;
}

function overlapsChangedLine(
  range: PilotParserNodeRange,
  changedLines: ReadonlySet<number>,
): boolean {
  for (let line = range.start_line; line <= range.end_line; line += 1) {
    if (changedLines.has(line)) {
      return true;
    }
  }

  return false;
}

function sourceLineBytes(source: string): readonly Uint8Array[] {
  const bytes = Buffer.from(source, "utf8");
  const lines: Uint8Array[] = [];
  let start = 0;

  for (let index = 0; index <= bytes.length; index += 1) {
    if (index < bytes.length && bytes[index] !== 0x0a) {
      continue;
    }

    let end = index;
    if (end > start && bytes[end - 1] === 0x0d) {
      end -= 1;
    }
    lines.push(bytes.subarray(start, end));
    if (index === bytes.length) {
      break;
    }
    start = index + 1;
  }

  return lines;
}

function hasNonWhitespace(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte !== 0x09 && byte !== 0x0b && byte !== 0x0c && byte !== 0x20) {
      return true;
    }
  }

  return false;
}

function isExportPrefix(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString("utf8").trim();
  return text === "" || text === "export";
}

function spanBytes(
  source: string,
  range: PilotParserNodeRange,
): Uint8Array | null {
  const lines = sourceLineBytes(source);
  const chunks: Uint8Array[] = [];

  for (let lineNumber = range.start_line; lineNumber <= range.end_line; lineNumber += 1) {
    const line = lines[lineNumber - 1];
    if (line === undefined) {
      return null;
    }

    const start = lineNumber === range.start_line ? range.start_column : 0;
    const end = lineNumber === range.end_line ? range.end_column : line.length;
    if (start < 0 || end > line.length || start > end) {
      return null;
    }

    chunks.push(line.subarray(start, end));
    if (lineNumber !== range.end_line) {
      chunks.push(Buffer.from("\n"));
    }
  }

  return Buffer.concat(chunks);
}

function spansMatch(
  stagedSource: string,
  baseSource: string,
  range: PilotParserNodeRange,
): boolean {
  const staged = spanBytes(stagedSource, range);
  const base = spanBytes(baseSource, range);
  if (staged === null || base === null || staged.byteLength !== base.byteLength) {
    return false;
  }

  for (let index = 0; index < staged.byteLength; index += 1) {
    if (staged[index] !== base[index]) {
      return false;
    }
  }

  return true;
}

function columnSpan(
  lineNumber: number,
  range: PilotParserNodeRange,
  lineLength: number,
): { readonly start: number; readonly end: number } | null {
  if (lineNumber < range.start_line || lineNumber > range.end_line) {
    return null;
  }

  return {
    start: lineNumber === range.start_line ? range.start_column : 0,
    end: lineNumber === range.end_line ? range.end_column : lineLength,
  };
}

function changedLineOutsideEvidence(
  source: string,
  lineNumber: number,
  entity: PilotParserNodeRange,
  guard: PilotParserNodeRange,
  matchedReturn: PilotParserNodeRange,
): boolean {
  const line = sourceLineBytes(source)[lineNumber - 1];
  if (line === undefined) {
    return false;
  }

  const entitySpan = columnSpan(lineNumber, entity, line.length);
  if (entitySpan === null) {
    return false;
  }

  const covered = [guard, matchedReturn]
    .map((range) => columnSpan(lineNumber, range, line.length))
    .filter((span) => span !== null);

  for (let index = entitySpan.start; index < entitySpan.end; index += 1) {
    const byte = line[index];
    if (byte === undefined || byte === 0x09 || byte === 0x0b || byte === 0x0c || byte === 0x20) {
      continue;
    }

    const insideEvidence = covered.some(
      (span) => span !== null && index >= span.start && index < span.end,
    );
    if (!insideEvidence) {
      return true;
    }
  }

  return false;
}

function changedLineLeavesEntity(
  source: string,
  lineNumber: number,
  entity: PilotParserNodeRange,
): boolean {
  const line = sourceLineBytes(source)[lineNumber - 1];
  if (line === undefined) {
    return false;
  }

  const start = lineNumber === entity.start_line ? entity.start_column : 0;
  const end = lineNumber === entity.end_line ? entity.end_column : line.length;
  return (
    !isExportPrefix(line.subarray(0, Math.max(0, start))) ||
    hasNonWhitespace(line.subarray(Math.min(line.length, Math.max(0, end))))
  );
}

function lineOutsideAnchors(
  source: string,
  lineNumber: number,
  entity: PilotParserNodeRange,
  guard: PilotParserNodeRange,
  matchedReturn: PilotParserNodeRange,
): string | null {
  const line = sourceLineBytes(source)[lineNumber - 1];
  if (line === undefined) {
    return null;
  }

  const entitySpan = columnSpan(lineNumber, entity, line.length);
  if (entitySpan === null) {
    return "";
  }

  const covered = [guard, matchedReturn]
    .map((range) => columnSpan(lineNumber, range, line.length))
    .filter((span) => span !== null);
  const kept: number[] = [];

  for (let index = entitySpan.start; index < entitySpan.end; index += 1) {
    const insideEvidence = covered.some(
      (span) => span !== null && index >= span.start && index < span.end,
    );
    if (insideEvidence) {
      continue;
    }

    const byte = line[index];
    if (byte !== undefined) {
      kept.push(byte);
    }
  }

  return Buffer.from(kept).toString("utf8");
}

function outsideAnchorTextChanged(
  baseSource: string | null | undefined,
  stagedSource: string,
  staged: PilotParserSuccess,
  lineNumber: number,
): boolean {
  if (baseSource === undefined || baseSource === null) {
    return false;
  }

  const parsed = parsePilotSource({ source: baseSource });
  if (typeof parsed !== "object" || parsed.kind !== "supported") {
    return true;
  }

  const baseOutside = lineOutsideAnchors(
    baseSource,
    lineNumber,
    parsed.entity_range,
    parsed.guard_range,
    parsed.return_range,
  );
  const stagedOutside = lineOutsideAnchors(
    stagedSource,
    lineNumber,
    staged.entity_range,
    staged.guard_range,
    staged.return_range,
  );

  return baseOutside === null || stagedOutside === null || baseOutside !== stagedOutside;
}

function baseRelationShifted(
  baseSource: string | null | undefined,
  staged: PilotParserSuccess,
): boolean {
  if (baseSource === undefined || baseSource === null) {
    return false;
  }

  const parsed = parsePilotSource({ source: baseSource });
  if (typeof parsed !== "object" || parsed.kind !== "supported") {
    return false;
  }

  const sameRelation =
    parsed.guard_text === staged.guard_text &&
    parsed.return_text === staged.return_text &&
    parsed.guard_value === staged.guard_value &&
    parsed.return_value === staged.return_value;
  const shifted =
    parsed.guard_range.start_column !== staged.guard_range.start_column ||
    parsed.return_range.start_column !== staged.return_range.start_column;

  return sameRelation && shifted;
}

export function analyzeLiteralGuardFunction(
  options: AnalyzeLiteralGuardFunctionOptions,
): PilotAnalysis {
  const parsed = parsePilotSource(options);

  if (parsed === "parse_failed" || parsed === "parse_timeout") {
    return {
      kind: "failed",
      reason: parsed,
    };
  }

  if (parsed.kind === "failed") {
    return parsed;
  }

  if (parsed.kind === "unsupported") {
    return {
      kind: "unsupported",
      reason: parsed.reason ?? "no_supported_staged_entity",
    };
  }

  const sourceLines = sourceLineBytes(options.source);
  if (
    !rangeFitsSource(parsed.entity_range, sourceLines) ||
    !rangeFitsSource(parsed.guard_range, sourceLines) ||
    !rangeFitsSource(parsed.return_range, sourceLines)
  ) {
    return {
      kind: "failed",
      reason: "parse_failed",
    };
  }

  const changedLines = new Set(options.changed_lines);

  if (
    !overlapsChangedLine(parsed.guard_range, changedLines) &&
    !overlapsChangedLine(parsed.return_range, changedLines)
  ) {
    return {
      kind: "unsupported",
      reason: "unmapped_region",
    };
  }

  if (baseRelationShifted(options.base_source, parsed)) {
    return {
      kind: "unsupported",
      reason: "unmapped_region",
    };
  }

  const evidenceUnchanged =
    options.base_source !== undefined &&
    options.base_source !== null &&
    spansMatch(options.source, options.base_source, parsed.guard_range) &&
    spansMatch(options.source, options.base_source, parsed.return_range);
  const newSingleLine =
    (options.base_source === undefined || options.base_source === null) &&
    parsed.entity_range.start_line === parsed.entity_range.end_line;

  for (const line of changedLines) {
    const overlapsGuardOrReturn =
      (line >= parsed.guard_range.start_line &&
        line <= parsed.guard_range.end_line) ||
      (line >= parsed.return_range.start_line &&
        line <= parsed.return_range.end_line);
    if (!overlapsGuardOrReturn) {
      continue;
    }

    if (changedLineLeavesEntity(options.source, line, parsed.entity_range)) {
      return {
        kind: "unsupported",
        reason: "unmapped_region",
      };
    }

    if (
      (evidenceUnchanged || newSingleLine) &&
      changedLineOutsideEvidence(
        options.source,
        line,
        parsed.entity_range,
        parsed.guard_range,
        parsed.return_range,
      )
    ) {
      return {
        kind: "unsupported",
        reason: "unmapped_region",
      };
    }

    if (
      !evidenceUnchanged &&
      outsideAnchorTextChanged(
        options.base_source,
        options.source,
        parsed,
        line,
      )
    ) {
      return {
        kind: "unsupported",
        reason: "unmapped_region",
      };
    }
  }

  const guardAnchor = anchor(options, parsed.guard_range);
  const returnAnchor = anchor(options, parsed.return_range);
  const entityId =
    `${options.path}:${parsed.entity_name}:${parsed.entity_range.start_line}`;
  const evidenceId = `${options.path}:${parsed.entity_name}:guard`;
  const relation =
    `${parsed.guard_text} -> return ${JSON.stringify(parsed.return_value)}`;

  if (
    [entityId, evidenceId, relation].some(
      (value) => value.length > MAX_STAGED_TEXT_CHARACTERS,
    )
  ) {
    return {
      kind: "unsupported",
      reason: "no_supported_staged_entity",
    };
  }

  return {
    kind: "supported",
    entity: {
      id: entityId,
      name: parsed.entity_name,
      anchor: anchor(options, parsed.entity_range),
    },
    evidence: {
      id: evidenceId,
      kind: "guard",
      relation,
      anchors: [guardAnchor, returnAnchor],
      derivation: "deterministic",
      coverage: "supported",
      claim_state: "observed",
      details_available: false,
    },
    scenario: {
      basis: "literal_guard_match",
      given: {
        parameter: parsed.parameter_name,
        value: parsed.guard_value,
      },
      when: parsed.invocation,
    },
    expected_return: parsed.return_value,
  };
}
