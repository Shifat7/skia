import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  LANGUAGE_REGISTRY,
  analyzeSourceFile,
  resolveLanguageRegistration,
} from "../src/languages/registry.js";
import type {
  AnalyzeSourceFileOptions,
  LanguageParserFactory,
} from "../src/languages/types.js";
import type { CoverageEventId, FailedParse, ParseResult, ParsedSource, PartiallyParsedSource } from "../src/types.js";

const FIXTURE_DIRECTORY = path.join(process.cwd(), "fixtures/languages");

interface BytesFixture {
  readonly bytes: readonly number[];
}

interface BomFixture {
  readonly source: string;
  readonly with_utf8_bom: boolean;
}

interface UnsupportedCaseFixture {
  readonly name: string;
  readonly status: string;
  readonly mode: string;
  readonly path: string;
}

function readFixtureBytes(filename: string): Uint8Array {
  return fs.readFileSync(path.join(FIXTURE_DIRECTORY, filename));
}

function readFixtureJson<T>(filename: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIRECTORY, filename), "utf8"),
  ) as T;
}

function coverageEventId(value: string): CoverageEventId {
  return value as CoverageEventId;
}

function analyze(
  overrides: Partial<AnalyzeSourceFileOptions> & Pick<AnalyzeSourceFileOptions, "path" | "bytes">,
): ReturnType<typeof analyzeSourceFile> {
  const {
    bytes,
    path,
    ...rest
  } = overrides;

  return analyzeSourceFile({
    coverage_event_id: coverageEventId(`coverage:${path}`),
    max_bytes: 4_096,
    mode: "100644",
    path,
    snapshot_kind: "staged",
    status: "A",
    bytes,
    ...rest,
  });
}

function assertParsed(parseResult: ParseResult | null): ParsedSource {
  if (parseResult === null) {
    throw new Error("expected a parsed result");
  }

  assert.strictEqual(parseResult.kind, "parsed");
  return parseResult as ParsedSource;
}

function assertPartial(parseResult: ParseResult | null): PartiallyParsedSource {
  if (parseResult === null) {
    throw new Error("expected a partial result");
  }

  assert.strictEqual(parseResult.kind, "partial");
  return parseResult as PartiallyParsedSource;
}

function assertFailed(parseResult: ParseResult | null): FailedParse {
  if (parseResult === null) {
    throw new Error("expected a failed result");
  }

  assert.strictEqual(parseResult.kind, "failed");
  return parseResult as FailedParse;
}

test("language registry remains exact, case-sensitive, and discloses pinned parser versions", () => {
  assert.deepStrictEqual(
    LANGUAGE_REGISTRY.map((entry) => ({
      extension: entry.extension,
      language: entry.language,
      dialect_id: entry.dialect_id,
      parser_id: entry.parser_id,
      parser_version: entry.parser.version,
      grammar_version: entry.grammar.version,
    })),
    [
      {
        extension: ".ts",
        language: "typescript",
        dialect_id: "typescript",
        parser_id: "tree-sitter-typescript.typescript",
        parser_version: "0.21.1",
        grammar_version: "0.23.2",
      },
      {
        extension: ".tsx",
        language: "tsx",
        dialect_id: "tsx",
        parser_id: "tree-sitter-typescript.tsx",
        parser_version: "0.21.1",
        grammar_version: "0.23.2",
      },
      {
        extension: ".py",
        language: "python",
        dialect_id: "python",
        parser_id: "tree-sitter-python",
        parser_version: "0.21.1",
        grammar_version: "0.21.0",
      },
    ],
  );

  assert.strictEqual(resolveLanguageRegistration("src/example.ts")?.language, "typescript");
  assert.strictEqual(resolveLanguageRegistration("src/example.tsx")?.language, "tsx");
  assert.strictEqual(resolveLanguageRegistration("src/example.py")?.language, "python");
  assert.strictEqual(resolveLanguageRegistration("src/example.TS"), null);
  assert.strictEqual(resolveLanguageRegistration("src/example.Py"), null);
});

test("language parser supports TypeScript, TSX, and Python with artifact-safe syntax tree summaries", () => {
  const tsResult = analyze({
    path: "src/sample.ts",
    bytes: readFixtureBytes("sample.ts"),
  });
  const tsxResult = analyze({
    path: "src/sample.tsx",
    bytes: readFixtureBytes("sample.tsx"),
  });
  const pyResult = analyze({
    path: "src/sample.py",
    bytes: readFixtureBytes("sample.py"),
  });

  for (const result of [tsResult, tsxResult, pyResult]) {
    const parseResult = assertParsed(result.parse_result);

    assert.strictEqual(result.coverage_event.coverage, "supported");
    assert.strictEqual(result.coverage_event.reason, null);
    assert.ok(result.registration !== null);
    assert.deepStrictEqual(parseResult.syntax_error_ranges, []);
    assert.ok(parseResult.syntax_tree.root.type.length > 0);
    JSON.stringify(parseResult.syntax_tree);
    assert.strictEqual("rootNode" in parseResult.syntax_tree, false);
  }

  assert.strictEqual(assertParsed(tsResult.parse_result).syntax_tree.root.type, "program");
  assert.strictEqual(assertParsed(tsxResult.parse_result).syntax_tree.root.type, "program");
  assert.strictEqual(assertParsed(pyResult.parse_result).syntax_tree.root.type, "module");
});

test("valid multibyte UTF-8 source reports root byte and column offsets in UTF-8 bytes, not UTF-16 code units", () => {
  const bytes = readFixtureBytes("multibyte.ts");
  const result = analyze({
    path: "src/multibyte.ts",
    bytes,
  });
  const parseResult = assertParsed(result.parse_result);
  const expectedEndByte = bytes.byteLength;

  assert.strictEqual(parseResult.syntax_tree.root.start_byte, 0);
  assert.strictEqual(parseResult.syntax_tree.root.end_byte, expectedEndByte);
  assert.strictEqual(parseResult.syntax_tree.root.start_line, 1);
  assert.strictEqual(parseResult.syntax_tree.root.start_column, 0);
  assert.strictEqual(parseResult.syntax_tree.root.end_line, 2);
  assert.strictEqual(parseResult.syntax_tree.root.end_column, 0);
});

test("syntax errors produce partial coverage with ordered, coalesced byte ranges and deterministic results", () => {
  const first = analyze({
    path: "src/syntax-error.ts",
    bytes: readFixtureBytes("syntax-error.ts"),
  });
  const second = analyze({
    path: "src/syntax-error.ts",
    bytes: readFixtureBytes("syntax-error.ts"),
  });

  assert.strictEqual(first.coverage_event.coverage, "partial");
  assert.strictEqual(first.coverage_event.reason, "syntax_error");
  const partial = assertPartial(first.parse_result);

  assert.ok(partial.syntax_error_ranges.length > 0);
  assert.deepStrictEqual(first, second);

  const ranges = partial.syntax_error_ranges;

  for (let index = 1; index < ranges.length; index += 1) {
    assert.ok(ranges[index - 1]!.start_byte <= ranges[index]!.start_byte);
    assert.ok(ranges[index - 1]!.end_byte <= ranges[index]!.start_byte);
  }
});

test("multibyte UTF-8 syntax errors report byte-exact ranges after multibyte characters", () => {
  const bytes = readFixtureBytes("multibyte-syntax-error.ts");
  const result = analyze({
    path: "src/multibyte-syntax-error.ts",
    bytes,
  });
  const partial = assertPartial(result.parse_result);
  const expectedStartByte = Buffer.from("const café = (1 +", "utf8").byteLength;
  const expectedEndByte = expectedStartByte;

  assert.strictEqual(result.coverage_event.coverage, "partial");
  assert.strictEqual(result.coverage_event.reason, "syntax_error");
  assert.strictEqual(partial.syntax_error_ranges.length, 1);
  assert.deepStrictEqual(partial.syntax_error_ranges[0], {
    start_byte: expectedStartByte,
    end_byte: expectedEndByte,
    start_line: 1,
    start_column: expectedStartByte,
    end_line: 1,
    end_column: expectedEndByte,
  });
});

test("strict UTF-8 decoding removes an optional leading BOM before parsing", () => {
  const fixture = readFixtureJson<BomFixture>("bom.ts.json");
  const sourceBody = Buffer.from(fixture.source, "utf8");
  const sourceBytes = fixture.with_utf8_bom
    ? Uint8Array.from([0xef, 0xbb, 0xbf, ...sourceBody])
    : sourceBody;

  const result = analyze({
    path: "src/with-bom.ts",
    bytes: sourceBytes,
  });

  assert.strictEqual(result.coverage_event.coverage, "supported");
  assert.strictEqual(result.decoded_source?.had_utf8_bom, true);
  assert.strictEqual(result.decoded_source?.text.startsWith("\uFEFF"), false);
});

test("malformed UTF-8 fails with invalid_source_encoding and never constructs a parser", () => {
  let parserFactoryCalls = 0;
  const parserFactory: LanguageParserFactory = () => {
    parserFactoryCalls += 1;
    throw new Error("parser should not be created");
  };

  const result = analyze({
    path: "src/invalid.ts",
    bytes: Uint8Array.from(readFixtureJson<BytesFixture>("invalid-utf8.json").bytes),
    parser_factory: parserFactory,
  });

  assert.strictEqual(result.coverage_event.coverage, "failed");
  assert.strictEqual(result.coverage_event.reason, "invalid_source_encoding");
  assert.strictEqual(assertFailed(result.parse_result).reason, "invalid_source_encoding");
  assert.strictEqual(parserFactoryCalls, 0);
});

test("NUL bytes fail with binary_source and never construct a parser", () => {
  let parserFactoryCalls = 0;
  const parserFactory: LanguageParserFactory = () => {
    parserFactoryCalls += 1;
    throw new Error("parser should not be created");
  };

  const result = analyze({
    path: "src/binary.ts",
    bytes: Uint8Array.from(readFixtureJson<BytesFixture>("nul-source.json").bytes),
    parser_factory: parserFactory,
  });

  assert.strictEqual(result.coverage_event.coverage, "failed");
  assert.strictEqual(result.coverage_event.reason, "binary_source");
  assert.strictEqual(assertFailed(result.parse_result).reason, "binary_source");
  assert.strictEqual(parserFactoryCalls, 0);
});

test("unsupported extensions remain inventory-only coverage and skip decoding and parsing", () => {
  let parserFactoryCalls = 0;
  const parserFactory: LanguageParserFactory = () => {
    parserFactoryCalls += 1;
    throw new Error("parser should not be created");
  };

  const result = analyze({
    path: "docs/unsupported-extension.md",
    bytes: readFixtureBytes("unsupported-extension.md"),
    parser_factory: parserFactory,
  });

  assert.strictEqual(result.coverage_event.coverage, "unsupported");
  assert.strictEqual(result.coverage_event.reason, "unsupported_language");
  assert.strictEqual(result.registration, null);
  assert.strictEqual(result.parse_result, null);
  assert.strictEqual(result.decoded_source, null);
  assert.strictEqual(parserFactoryCalls, 0);
});

test("oversized blobs stay unsupported and do not parse or decode", () => {
  let parserFactoryCalls = 0;
  const parserFactory: LanguageParserFactory = () => {
    parserFactoryCalls += 1;
    throw new Error("parser should not be created");
  };

  const stagedResult = analyze({
    path: "src/oversized.ts",
    bytes: readFixtureBytes("oversized.ts"),
    max_bytes: 8,
    parser_factory: parserFactory,
  });
  const repositoryResult = analyze({
    path: "src/oversized.ts",
    bytes: readFixtureBytes("oversized.ts"),
    max_bytes: 8,
    snapshot_kind: "repository",
    status: null,
    parser_factory: parserFactory,
  });

  assert.strictEqual(stagedResult.coverage_event.coverage, "unsupported");
  assert.strictEqual(stagedResult.coverage_event.reason, "staged_budget_exceeded");
  assert.strictEqual(repositoryResult.coverage_event.coverage, "unsupported");
  assert.strictEqual(repositoryResult.coverage_event.reason, "repository_limit_exceeded");
  assert.strictEqual(stagedResult.parse_result, null);
  assert.strictEqual(repositoryResult.parse_result, null);
  assert.strictEqual(parserFactoryCalls, 0);
});

test("unsupported git statuses and modes stay unsupported without decoding or parsing", () => {
  let parserFactoryCalls = 0;
  const parserFactory: LanguageParserFactory = () => {
    parserFactoryCalls += 1;
    throw new Error("parser should not be created");
  };
  const cases = readFixtureJson<readonly UnsupportedCaseFixture[]>("unsupported-cases.json");

  for (const fixture of cases) {
    const result = analyze({
      path: fixture.path,
      mode: fixture.mode,
      status: fixture.status,
      bytes: Uint8Array.from(readFixtureJson<BytesFixture>("invalid-utf8.json").bytes),
      parser_factory: parserFactory,
    });

    assert.strictEqual(result.coverage_event.coverage, "unsupported", fixture.name);
    assert.strictEqual(
      result.coverage_event.reason,
      fixture.mode === "100644" ? "unsupported_status" : "unsupported_file_mode",
      fixture.name,
    );
    assert.strictEqual(result.parse_result, null, fixture.name);
    assert.strictEqual(result.decoded_source, null, fixture.name);
  }

  assert.strictEqual(parserFactoryCalls, 0);
});

test("parser initialization failures are failed rather than unsupported", () => {
  const result = analyze({
    path: "src/sample.ts",
    bytes: readFixtureBytes("sample.ts"),
    parser_factory: () => ({
      setLanguage() {
        throw new Error("boom");
      },
      parse() {
        throw new Error("parse should not be reached");
      },
    }),
  });

  assert.strictEqual(result.coverage_event.coverage, "failed");
  assert.strictEqual(result.coverage_event.reason, "parser_initialization_failed");
  assert.strictEqual(assertFailed(result.parse_result).reason, "parser_initialization_failed");
});

test("parser execution failures are failed with a stable reason", () => {
  const result = analyze({
    path: "src/sample.ts",
    bytes: readFixtureBytes("sample.ts"),
    parser_factory: () => ({
      setLanguage() {},
      parse() {
        throw new Error("boom");
      },
    }),
  });

  assert.strictEqual(result.coverage_event.coverage, "failed");
  assert.strictEqual(result.coverage_event.reason, "parse_failed");
  assert.strictEqual(assertFailed(result.parse_result).reason, "parse_failed");
});
