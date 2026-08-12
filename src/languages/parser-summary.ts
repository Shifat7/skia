import { Buffer } from "node:buffer";

import type {
  ParserVersionDisclosure,
  SyntaxErrorRange,
  SyntaxTreeNodeSummary,
  SyntaxTreeSummary,
} from "../types.js";
import type {
  LanguageParserNode,
  LanguageRegistration,
} from "./types.js";

interface ByteRange {
  start_byte: number;
  end_byte: number;
}

export interface ParserSummary {
  readonly syntax_tree: SyntaxTreeSummary;
  readonly syntax_error_ranges: readonly SyntaxErrorRange[];
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

export function summarizeParserTree(
  registration: LanguageRegistration,
  rootNode: LanguageParserNode,
  decodedText: string,
  contentBytes: Uint8Array,
): ParserSummary {
  const codeUnitToByteOffsets = createCodeUnitToByteOffsets(decodedText);
  const lineStartBytes = createLineStartBytes(contentBytes);

  return {
    syntax_tree: createSyntaxTreeSummary(
      registration,
      rootNode,
      codeUnitToByteOffsets,
      lineStartBytes,
    ),
    syntax_error_ranges: collectErrorRanges(
      rootNode,
      codeUnitToByteOffsets,
    ).map((range) =>
      toSyntaxRange(range, lineStartBytes),
    ),
  };
}
