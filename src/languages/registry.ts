import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateRelativePath } from "../paths.js";
import type {
  CoverageEvent,
  ParseFailureReason,
  ParseResult,
  RepositoryRelativePath,
  SourceLanguage,
  StableErrorReason,
  SyntaxErrorRange,
  SyntaxTreeSummary,
} from "../types.js";
import {
  type ParserSummary,
  summarizeParserTree,
} from "./parser-summary.js";
import {
  type AnalyzeSourceFileOptions,
  type DecodedSource,
  type LanguageParser,
  type LanguageParserFactory,
  type LanguageRegistration,
  type SourceAnalysisResult,
} from "./types.js";

const require = createRequire(import.meta.url);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);
const DEFAULT_PARSE_TIMEOUT_MS = 1_000;
const MAX_ISOLATED_PARSER_OUTPUT_BYTES = 4 * 1024 * 1024;
const ISOLATED_PARSER_CHILD_PATH = fileURLToPath(
  new URL("./isolated-parser-child.js", import.meta.url),
);
const NODE_EXECUTABLE = (process as unknown as {
  readonly execPath?: string;
}).execPath ?? "node";

type IsolatedParserResponse =
  | {
    readonly kind: "parsed";
    readonly summary: ParserSummary;
  }
  | {
    readonly kind: "failed";
    readonly reason: Extract<
      ParseFailureReason,
      "parse_failed" | "parse_timeout" | "parser_initialization_failed"
    >;
  };

interface SpawnError extends Error {
  readonly code?: string;
}

const LANGUAGE_METADATA = [
  {
    extension: ".ts",
    language: "typescript",
    dialect_id: "typescript",
    parser_id: "tree-sitter-typescript.typescript",
    parser: { name: "tree-sitter", version: "0.21.1" },
    grammar: { name: "tree-sitter-typescript", version: "0.23.2" },
  },
  {
    extension: ".tsx",
    language: "tsx",
    dialect_id: "tsx",
    parser_id: "tree-sitter-typescript.tsx",
    parser: { name: "tree-sitter", version: "0.21.1" },
    grammar: { name: "tree-sitter-typescript", version: "0.23.2" },
  },
  {
    extension: ".py",
    language: "python",
    dialect_id: "python",
    parser_id: "tree-sitter-python",
    parser: { name: "tree-sitter", version: "0.21.1" },
    grammar: { name: "tree-sitter-python", version: "0.21.0" },
  },
] as const;

export const LANGUAGE_REGISTRY = Object.freeze(
  LANGUAGE_METADATA.map((metadata) => ({
    ...metadata,
    load_language: () => {
      if (metadata.parser_id === "tree-sitter-python") {
        return (require("tree-sitter-python") as { readonly language: unknown }).language;
      }

      const grammar = require("tree-sitter-typescript") as {
        readonly typescript: unknown;
        readonly tsx: unknown;
      };

      return metadata.parser_id.endsWith(".tsx")
        ? grammar.tsx
        : grammar.typescript;
    },
  })) satisfies readonly LanguageRegistration[],
);

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.byteLength >= UTF8_BOM.byteLength
    && equalBytes(bytes.slice(0, UTF8_BOM.byteLength), UTF8_BOM);
}

function createCoverageEvent(
  options: {
    readonly coverage: CoverageEvent["coverage"];
    readonly language: SourceLanguage | null;
    readonly path: RepositoryRelativePath;
    readonly reason: StableErrorReason | null;
  },
  coverageEventId: AnalyzeSourceFileOptions["coverage_event_id"],
): CoverageEvent {
  return {
    id: coverageEventId,
    coverage: options.coverage,
    units: 1,
    reason: options.reason,
    path: options.path,
    language: options.language,
    anchors: [],
  };
}

function unsupportedLimitReason(
  snapshotKind: AnalyzeSourceFileOptions["snapshot_kind"],
): "repository_limit_exceeded" | "staged_budget_exceeded" {
  return snapshotKind === "repository"
    ? "repository_limit_exceeded"
    : "staged_budget_exceeded";
}

function createUnsupportedResult(
  path: RepositoryRelativePath,
  registration: LanguageRegistration | null,
  reason: StableErrorReason,
  coverageEventId: AnalyzeSourceFileOptions["coverage_event_id"],
): SourceAnalysisResult {
  return {
    coverage_event: createCoverageEvent(
      {
        coverage: "unsupported",
        language: registration?.language ?? null,
        path,
        reason,
      },
      coverageEventId,
    ),
    decoded_source: null,
    parse_result: null,
    registration,
  };
}

function createFailedResult(
  path: RepositoryRelativePath,
  registration: LanguageRegistration,
  reason: ParseFailureReason,
  coverageEventId: AnalyzeSourceFileOptions["coverage_event_id"],
): SourceAnalysisResult {
  const parseResult: ParseResult = {
    kind: "failed",
    language: registration.language,
    reason,
    syntax_tree: null,
    syntax_error_ranges: [],
  };

  return {
    coverage_event: createCoverageEvent(
      {
        coverage: "failed",
        language: registration.language,
        path,
        reason,
      },
      coverageEventId,
    ),
    decoded_source: null,
    parse_result: parseResult,
    registration,
  };
}

function decodeSourceBytes(
  path: RepositoryRelativePath,
  bytes: Uint8Array,
): DecodedSource | ParseFailureReason {
  const contentBytes = hasUtf8Bom(bytes) ? bytes.slice(UTF8_BOM.byteLength) : bytes;

  for (const byte of contentBytes) {
    if (byte === 0x00) {
      return "binary_source";
    }
  }

  try {
    return {
      path,
      text: UTF8_DECODER.decode(contentBytes),
      byte_length: contentBytes.byteLength,
      had_utf8_bom: contentBytes.byteLength !== bytes.byteLength,
    };
  } catch {
    return "invalid_source_encoding";
  }
}

function contentBytesForDecodedSource(
  bytes: Uint8Array,
  decoded: DecodedSource,
): Uint8Array {
  return bytes.slice(decoded.had_utf8_bom ? UTF8_BOM.byteLength : 0);
}

function createParsedOrPartialResult(
  path: RepositoryRelativePath,
  registration: LanguageRegistration,
  decoded: DecodedSource,
  summary: ParserSummary,
  coverageEventId: AnalyzeSourceFileOptions["coverage_event_id"],
): SourceAnalysisResult {
  if (summary.syntax_error_ranges.length === 0) {
    const parseResult: ParseResult = {
      kind: "parsed",
      language: registration.language,
      syntax_tree: summary.syntax_tree,
      syntax_error_ranges: [],
    };

    return {
      coverage_event: createCoverageEvent(
        {
          coverage: "supported",
          language: registration.language,
          path,
          reason: null,
        },
        coverageEventId,
      ),
      decoded_source: decoded,
      parse_result: parseResult,
      registration,
    };
  }

  const parseResult: ParseResult = {
    kind: "partial",
    language: registration.language,
    syntax_tree: summary.syntax_tree,
    syntax_error_ranges: summary.syntax_error_ranges as [
      SyntaxErrorRange,
      ...SyntaxErrorRange[],
    ],
  };

  return {
    coverage_event: createCoverageEvent(
      {
        coverage: "partial",
        language: registration.language,
        path,
        reason: "syntax_error",
      },
      coverageEventId,
    ),
    decoded_source: decoded,
    parse_result: parseResult,
    registration,
  };
}

function parseWithInjectedParserFactory(
  options: {
    readonly content_bytes: Uint8Array;
    readonly coverage_event_id: AnalyzeSourceFileOptions["coverage_event_id"];
    readonly decoded: DecodedSource;
    readonly parser_factory: LanguageParserFactory;
    readonly path: RepositoryRelativePath;
    readonly registration: LanguageRegistration;
  },
): SourceAnalysisResult {
  let parser: LanguageParser;

  try {
    parser = options.parser_factory(options.registration);
    parser.setLanguage(options.registration.load_language());
  } catch {
    return createFailedResult(
      options.path,
      options.registration,
      "parser_initialization_failed",
      options.coverage_event_id,
    );
  }

  try {
    const tree = parser.parse(options.decoded.text);
    const summary = summarizeParserTree(
      options.registration,
      tree.rootNode,
      options.decoded.text,
      options.content_bytes,
    );

    return createParsedOrPartialResult(
      options.path,
      options.registration,
      options.decoded,
      summary,
      options.coverage_event_id,
    );
  } catch {
    return createFailedResult(
      options.path,
      options.registration,
      "parse_failed",
      options.coverage_event_id,
    );
  }
}

function normalizeParseTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
    return DEFAULT_PARSE_TIMEOUT_MS;
  }

  return Math.max(1, Math.floor(timeoutMs));
}

function isSpawnTimeout(error: SpawnError | undefined): boolean {
  return error?.code === "ETIMEDOUT";
}

function isIsolatedParserResponse(value: unknown): value is IsolatedParserResponse {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<IsolatedParserResponse>;

  if (candidate.kind === "parsed") {
    return candidate.summary !== undefined;
  }

  return candidate.kind === "failed"
    && (
      candidate.reason === "parse_failed"
      || candidate.reason === "parse_timeout"
      || candidate.reason === "parser_initialization_failed"
    );
}

function parseWithIsolatedDefaultParser(
  options: {
    readonly command: AnalyzeSourceFileOptions["parser_isolation_command"];
    readonly content_bytes: Uint8Array;
    readonly decoded: DecodedSource;
    readonly registration: LanguageRegistration;
    readonly timeout_ms: number | undefined;
  },
): IsolatedParserResponse {
  const command = options.command ?? {
    command: NODE_EXECUTABLE,
    args: [ISOLATED_PARSER_CHILD_PATH],
  };
  const result = spawnSync(
    command.command,
    command.args ?? [],
    {
      encoding: "utf8",
      input: JSON.stringify({
        parser_id: options.registration.parser_id,
        text: options.decoded.text,
        content_bytes: Array.from(options.content_bytes),
      }),
      maxBuffer: MAX_ISOLATED_PARSER_OUTPUT_BYTES,
      shell: false,
      timeout: normalizeParseTimeoutMs(options.timeout_ms),
    },
  );
  const spawnError = result.error as SpawnError | undefined;

  if (isSpawnTimeout(spawnError)) {
    return {
      kind: "failed",
      reason: "parse_timeout",
    };
  }

  if (spawnError !== undefined || result.status !== 0 || result.signal !== null) {
    return {
      kind: "failed",
      reason: "parse_failed",
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout));

    if (isIsolatedParserResponse(parsed)) {
      return parsed;
    }
  } catch {
    // Fall through to the stable failed contract below.
  }

  return {
    kind: "failed",
    reason: "parse_failed",
  };
}

export function resolveLanguageRegistration(
  path: string,
): LanguageRegistration | null {
  let relativePath: RepositoryRelativePath;

  try {
    relativePath = validateRelativePath(path);
  } catch {
    return null;
  }

  return LANGUAGE_REGISTRY.find((entry) => relativePath.endsWith(entry.extension)) ?? null;
}

export function analyzeSourceFile(
  options: AnalyzeSourceFileOptions,
): SourceAnalysisResult {
  const relativePath = validateRelativePath(options.path);
  const registration = resolveLanguageRegistration(relativePath);

  if (options.status !== null && options.status !== "A" && options.status !== "M") {
    return createUnsupportedResult(
      relativePath,
      registration,
      "unsupported_status",
      options.coverage_event_id,
    );
  }

  if (options.mode !== "100644" && options.mode !== "100755") {
    return createUnsupportedResult(
      relativePath,
      registration,
      "unsupported_file_mode",
      options.coverage_event_id,
    );
  }

  if (registration === null) {
    return createUnsupportedResult(
      relativePath,
      null,
      "unsupported_language",
      options.coverage_event_id,
    );
  }

  if (options.bytes.byteLength > options.max_bytes) {
    return createUnsupportedResult(
      relativePath,
      registration,
      unsupportedLimitReason(options.snapshot_kind),
      options.coverage_event_id,
    );
  }

  const decoded = decodeSourceBytes(relativePath, options.bytes);

  if (typeof decoded === "string") {
    return createFailedResult(
      relativePath,
      registration,
      decoded,
      options.coverage_event_id,
    );
  }

  const contentBytes = contentBytesForDecodedSource(options.bytes, decoded);

  if (options.parser_factory !== undefined) {
    return parseWithInjectedParserFactory({
      content_bytes: contentBytes,
      coverage_event_id: options.coverage_event_id,
      decoded,
      parser_factory: options.parser_factory,
      path: relativePath,
      registration,
    });
  }

  const isolatedResult = parseWithIsolatedDefaultParser({
    command: options.parser_isolation_command,
    content_bytes: contentBytes,
    decoded,
    registration,
    timeout_ms: options.parse_timeout_ms,
  });

  if (isolatedResult.kind === "failed") {
    return createFailedResult(
      relativePath,
      registration,
      isolatedResult.reason,
      options.coverage_event_id,
    );
  }

  return createParsedOrPartialResult(
    relativePath,
    registration,
    decoded,
    isolatedResult.summary,
    options.coverage_event_id,
  );
}
