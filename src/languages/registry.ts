import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

import { validateRelativePath } from "../paths.js";
import type {
  CoverageEvent,
  ParseFailureReason,
  ParseResult,
  ParserVersionDisclosure,
  RepositoryRelativePath,
  SourceLanguage,
  StableErrorReason,
  SyntaxErrorRange,
  SyntaxTreeNodeSummary,
  SyntaxTreeSummary,
} from "../types.js";
import { PYTHON_LANGUAGE_REGISTRATION } from "./python.js";
import {
  type AnalyzeSourceFileOptions,
  type DecodedSource,
  type LanguageParser,
  type LanguageParserFactory,
  type LanguageParserNode,
  type LanguageRegistration,
  type SourceAnalysisResult,
} from "./types.js";
import { TYPESCRIPT_LANGUAGE_REGISTRATIONS } from "./typescript.js";

const require = createRequire(import.meta.url);

type TreeSitterParserConstructor = new () => LanguageParser;

interface ByteRange {
  start_byte: number;
  end_byte: number;
}

const TREE_SITTER_PARSER = require("tree-sitter") as TreeSitterParserConstructor;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

export const LANGUAGE_REGISTRY = Object.freeze([
  ...TYPESCRIPT_LANGUAGE_REGISTRATIONS,
  PYTHON_LANGUAGE_REGISTRATION,
] as const satisfies readonly LanguageRegistration[]);

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

function buildParserDisclosure(
  registration: LanguageRegistration,
): ParserVersionDisclosure {
  return {
    parser_id: registration.parser_id,
    parser_package_name: registration.parser.name,
    parser_package_version: registration.parser.version,
    grammar_package_name: registration.grammar.name,
    grammar_package_version: registration.grammar.version,
  };
}

function createLineStartBytes(bytes: Uint8Array): readonly number[] {
  const starts = [0];

  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] === 0x0a && index + 1 <= bytes.byteLength) {
      starts.push(index + 1);
    }
  }

  return starts;
}

function createCodeUnitToByteOffsets(text: string): readonly number[] {
  const offsets = [0];
  let byteOffset = 0;

  for (const character of text) {
    byteOffset += Buffer.from(character, "utf8").byteLength;

    for (let index = 0; index < character.length; index += 1) {
      offsets.push(byteOffset);
    }
  }

  return offsets;
}

function mapCodeUnitOffsetToByteOffset(
  codeUnitToByteOffsets: readonly number[],
  codeUnitOffset: number,
): number {
  const mapped = codeUnitToByteOffsets[codeUnitOffset];

  if (mapped === undefined) {
    throw new Error(`parser offset ${codeUnitOffset} is outside the decoded source`);
  }

  return mapped;
}

function locateLineAndColumn(
  lineStartBytes: readonly number[],
  byteIndex: number,
): { readonly line: number; readonly column: number } {
  let low = 0;
  let high = lineStartBytes.length - 1;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStartBytes[middle] ?? 0;

    if (lineStart <= byteIndex) {
      best = middle;
      low = middle + 1;
      continue;
    }

    high = middle - 1;
  }

  const selectedLineStart = lineStartBytes[best] ?? 0;

  return {
    line: best + 1,
    column: byteIndex - selectedLineStart,
  };
}

function toSyntaxRange(
  range: ByteRange,
  lineStartBytes: readonly number[],
): SyntaxErrorRange {
  const start = locateLineAndColumn(lineStartBytes, range.start_byte);
  const end = locateLineAndColumn(lineStartBytes, range.end_byte);

  return {
    start_byte: range.start_byte,
    end_byte: range.end_byte,
    start_line: start.line,
    start_column: start.column,
    end_line: end.line,
    end_column: end.column,
  };
}

function summarizeNode(
  node: LanguageParserNode,
  codeUnitToByteOffsets: readonly number[],
  lineStartBytes: readonly number[],
): SyntaxTreeNodeSummary {
  const startByte = mapCodeUnitOffsetToByteOffset(
    codeUnitToByteOffsets,
    node.startIndex,
  );
  const endByte = mapCodeUnitOffsetToByteOffset(
    codeUnitToByteOffsets,
    node.endIndex,
  );
  const start = locateLineAndColumn(lineStartBytes, startByte);
  const end = locateLineAndColumn(lineStartBytes, endByte);

  return {
    type: node.type,
    grammar_type: node.grammarType,
    named: node.isNamed,
    missing: node.isMissing,
    extra: node.isExtra,
    has_error: node.hasError,
    error: node.isError,
    start_byte: startByte,
    end_byte: endByte,
    start_line: start.line,
    start_column: start.column,
    end_line: end.line,
    end_column: end.column,
    child_count: node.childCount,
    named_child_count: node.namedChildCount,
    descendant_count: node.descendantCount,
  };
}

function createSyntaxTreeSummary(
  registration: LanguageRegistration,
  rootNode: LanguageParserNode,
  codeUnitToByteOffsets: readonly number[],
  lineStartBytes: readonly number[],
): SyntaxTreeSummary {
  return {
    parser: buildParserDisclosure(registration),
    root: summarizeNode(rootNode, codeUnitToByteOffsets, lineStartBytes),
  };
}

function collectErrorRanges(
  rootNode: LanguageParserNode,
  codeUnitToByteOffsets: readonly number[],
): readonly ByteRange[] {
  const discovered: ByteRange[] = [];
  const stack: LanguageParserNode[] = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop();

    if (node === undefined) {
      continue;
    }

    if (node.isError || node.isMissing) {
      discovered.push({
        start_byte: mapCodeUnitOffsetToByteOffset(
          codeUnitToByteOffsets,
          node.startIndex,
        ),
        end_byte: mapCodeUnitOffsetToByteOffset(
          codeUnitToByteOffsets,
          node.endIndex,
        ),
      });
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];

      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  discovered.sort((left, right) => {
    if (left.start_byte !== right.start_byte) {
      return left.start_byte - right.start_byte;
    }

    return left.end_byte - right.end_byte;
  });

  const coalesced: ByteRange[] = [];

  for (const range of discovered) {
    const previous = coalesced.at(-1);

    if (previous === undefined || range.start_byte > previous.end_byte) {
      coalesced.push({ ...range });
      continue;
    }

    previous.end_byte = Math.max(previous.end_byte, range.end_byte);
  }

  return coalesced;
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

function defaultParserFactory(): LanguageParser {
  return new TREE_SITTER_PARSER();
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

  const parserFactory = options.parser_factory ?? (() => defaultParserFactory());
  let parser: LanguageParser;

  try {
    parser = parserFactory(registration);
    parser.setLanguage(registration.load_language());
  } catch {
    return createFailedResult(
      relativePath,
      registration,
      "parser_initialization_failed",
      options.coverage_event_id,
    );
  }

  try {
    const tree = parser.parse(decoded.text);
    const codeUnitToByteOffsets = createCodeUnitToByteOffsets(decoded.text);
    const lineStartBytes = createLineStartBytes(options.bytes.slice(
      decoded.had_utf8_bom ? UTF8_BOM.byteLength : 0,
    ));
    const syntaxTree = createSyntaxTreeSummary(
      registration,
      tree.rootNode,
      codeUnitToByteOffsets,
      lineStartBytes,
    );
    const syntaxErrorRanges = collectErrorRanges(
      tree.rootNode,
      codeUnitToByteOffsets,
    ).map((range) =>
      toSyntaxRange(range, lineStartBytes),
    );

    if (syntaxErrorRanges.length === 0) {
      const parseResult: ParseResult = {
        kind: "parsed",
        language: registration.language,
        syntax_tree: syntaxTree,
        syntax_error_ranges: [],
      };

      return {
        coverage_event: createCoverageEvent(
          {
            coverage: "supported",
            language: registration.language,
            path: relativePath,
            reason: null,
          },
          options.coverage_event_id,
        ),
        decoded_source: decoded,
        parse_result: parseResult,
        registration,
      };
    }

    const parseResult: ParseResult = {
      kind: "partial",
      language: registration.language,
      syntax_tree: syntaxTree,
      syntax_error_ranges: syntaxErrorRanges as [
        SyntaxErrorRange,
        ...SyntaxErrorRange[],
      ],
    };

    return {
      coverage_event: createCoverageEvent(
        {
          coverage: "partial",
          language: registration.language,
          path: relativePath,
          reason: "syntax_error",
        },
        options.coverage_event_id,
      ),
      decoded_source: decoded,
      parse_result: parseResult,
      registration,
    };
  } catch {
    return createFailedResult(
      relativePath,
      registration,
      "parse_failed",
      options.coverage_event_id,
    );
  }
}
