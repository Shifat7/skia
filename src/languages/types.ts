import type {
  CoverageEvent,
  CoverageEventId,
  ParseResult,
  RepositoryRelativePath,
  SnapshotKind,
  SourceLanguage,
} from "../types.js";

export interface VersionedPackage {
  readonly name: string;
  readonly version: string;
}

export interface LanguageRegistration {
  readonly extension: ".ts" | ".tsx" | ".py";
  readonly language: SourceLanguage;
  readonly dialect_id: SourceLanguage;
  readonly parser_id:
    | "tree-sitter-typescript.typescript"
    | "tree-sitter-typescript.tsx"
    | "tree-sitter-python";
  readonly parser: VersionedPackage;
  readonly grammar: VersionedPackage;
  readonly load_language: () => unknown;
}

export interface LanguageParserPoint {
  readonly row: number;
  readonly column: number;
}

export interface LanguageParserNode {
  readonly type: string;
  readonly grammarType: string;
  readonly isNamed: boolean;
  readonly isMissing: boolean;
  readonly isExtra: boolean;
  readonly hasError: boolean;
  readonly isError: boolean;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly startPosition: LanguageParserPoint;
  readonly endPosition: LanguageParserPoint;
  readonly childCount: number;
  readonly namedChildCount: number;
  readonly descendantCount: number;
  readonly children: readonly LanguageParserNode[];
}

export interface LanguageParserTree {
  readonly rootNode: LanguageParserNode;
}

export interface LanguageParser {
  setLanguage(language: unknown): void;
  parse(source: string): LanguageParserTree;
}

export type LanguageParserFactory = (
  registration: LanguageRegistration,
) => LanguageParser;

export interface ParserIsolationCommand {
  readonly command: string;
  readonly args?: readonly string[];
}

export interface AnalyzeSourceFileOptions {
  readonly bytes: Uint8Array;
  readonly coverage_event_id: CoverageEventId;
  readonly max_bytes: number;
  readonly mode: string;
  readonly parser_factory?: LanguageParserFactory;
  readonly parser_isolation_command?: ParserIsolationCommand;
  readonly parse_timeout_ms?: number;
  readonly path: string;
  readonly snapshot_kind: SnapshotKind;
  readonly status: string | null;
}

export interface DecodedSource {
  readonly path: RepositoryRelativePath;
  readonly text: string;
  readonly byte_length: number;
  readonly had_utf8_bom: boolean;
}

export interface SourceAnalysisResult {
  readonly coverage_event: CoverageEvent;
  readonly decoded_source: DecodedSource | null;
  readonly parse_result: ParseResult | null;
  readonly registration: LanguageRegistration | null;
}
