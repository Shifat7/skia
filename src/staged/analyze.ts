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
    Number.isInteger(range.start_line) &&
    Number.isInteger(range.start_column) &&
    Number.isInteger(range.end_line) &&
    Number.isInteger(range.end_column) &&
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
  options: AnalyzeLiteralGuardFunctionOptions,
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
