import { createRequire } from "node:module";
import fs from "node:fs";
import process from "node:process";

import { TYPESCRIPT_LANGUAGE_REGISTRATIONS } from "../languages/typescript.js";
import { MAX_STAGED_TEXT_CHARACTERS } from "../limits.js";
import type {
  JsonScalar,
  PilotParserNodeRange,
  PilotParserResponse,
} from "./types.js";
import { jsonScalarFromUnknown } from "./json-scalar.js";

interface ParserNode {
  readonly type: string;
  readonly text: string;
  readonly isNamed: boolean;
  readonly hasError: boolean;
  readonly startPosition: { readonly row: number; readonly column: number };
  readonly endPosition: { readonly row: number; readonly column: number };
  readonly children: readonly ParserNode[];
  readonly namedChildren: readonly ParserNode[];
  childForFieldName(name: string): ParserNode | null;
}

interface ParserTree {
  readonly rootNode: ParserNode;
}

interface Parser {
  setLanguage(language: unknown): void;
  parse(source: string): ParserTree;
}

type ParserConstructor = new () => Parser;

interface ParserInput {
  readonly source: string;
}

const require = createRequire(import.meta.url);
const TreeSitterParser = require("tree-sitter") as ParserConstructor;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function range(node: ParserNode): PilotParserNodeRange {
  return {
    start_line: node.startPosition.row + 1,
    start_column: node.startPosition.column,
    end_line: node.endPosition.row + 1,
    end_column: node.endPosition.column,
  };
}

function topLevelFunctions(root: ParserNode): readonly ParserNode[] {
  const matches: ParserNode[] = [];

  for (const node of root.namedChildren) {
    if (node.type === "function_declaration") {
      matches.push(node);
      continue;
    }

    if (node.type === "export_statement") {
      for (const child of node.namedChildren) {
        if (child.type === "function_declaration") {
          matches.push(child);
        }
      }
    }
  }

  return matches;
}

function decodedIdentifier(text: string): string {
  return text.replace(
    /\\u\{([0-9A-Fa-f]+)\}|\\u([0-9A-Fa-f]{4})/g,
    (match, braced: string | undefined, four: string | undefined) => {
      const hex = braced ?? four;
      if (hex === undefined) {
        return match;
      }

      const codePoint = Number.parseInt(hex, 16);
      if (codePoint < 0 || codePoint > 0x10ffff) {
        return match;
      }

      return String.fromCodePoint(codePoint);
    },
  );
}

function mentionsIdentifier(node: ParserNode, name: string): boolean {
  if (
    (node.type === "identifier" || node.type === "property_identifier") &&
    decodedIdentifier(node.text) === decodedIdentifier(name)
  ) {
    return true;
  }

  return node.children.some((child) => mentionsIdentifier(child, name));
}

function calleeIdentifier(node: ParserNode): ParserNode | null {
  let callee: ParserNode | null = node;

  while (
    callee !== null &&
    callee.type === "parenthesized_expression" &&
    callee.namedChildren.length === 1
  ) {
    callee = callee.namedChildren[0] ?? null;
  }

  return callee?.type === "identifier" ? callee : null;
}

function containsDirectEval(root: ParserNode): boolean {
  const visit = (node: ParserNode): boolean => {
    if (node.type === "call_expression") {
      const callee = node.childForFieldName("function");
      if (callee !== null && calleeIdentifier(callee)?.text === "eval") {
        return true;
      }
    }

    return node.children.some(visit);
  };

  return visit(root);
}

function staticSubscriptIndex(
  node: ParserNode,
): { readonly kind: "string"; readonly value: string } | { readonly kind: "other" } | { readonly kind: "unknown" } {
  let current = node;

  while (
    current.type === "parenthesized_expression" &&
    current.namedChildren.length === 1
  ) {
    const inner = current.namedChildren[0];
    if (inner === undefined) {
      return { kind: "unknown" };
    }
    current = inner;
  }

  if (current.type === "number") {
    return { kind: "other" };
  }

  if (current.type === "string") {
    const text = current.text;
    if (text.startsWith("\"") && text.endsWith("\"")) {
      try {
        const value = JSON.parse(text) as unknown;
        return typeof value === "string"
          ? { kind: "string", value }
          : { kind: "unknown" };
      } catch {
        return { kind: "unknown" };
      }
    }

    if (
      text.startsWith("'") &&
      text.endsWith("'") &&
      !text.slice(1, -1).includes("\\")
    ) {
      return { kind: "string", value: text.slice(1, -1) };
    }

    return { kind: "unknown" };
  }

  if (current.type === "template_string") {
    const fragments = current.namedChildren;
    const fragment = fragments.length === 1 ? fragments[0] : undefined;
    if (
      fragment?.type !== "string_fragment" ||
      fragment.text.includes("\\") ||
      fragments.some((child) => child.type !== "string_fragment")
    ) {
      return { kind: "unknown" };
    }

    return { kind: "string", value: fragment.text };
  }

  return { kind: "unknown" };
}

function subscriptMayRebind(node: ParserNode, name: string): boolean {
  if (node.type === "subscript_expression") {
    const index = node.childForFieldName("index");
    const value = index === null
      ? { kind: "unknown" as const }
      : staticSubscriptIndex(index);
    const provenDifferent =
      value.kind === "other" ||
      (value.kind === "string" && value.value !== name);

    if (!provenDifferent) {
      return true;
    }
  }

  return node.children.some((child) => subscriptMayRebind(child, name));
}

function writesBinding(root: ParserNode, name: string): boolean {
  const visit = (node: ParserNode): boolean => {
    const target = node.type === "assignment_expression" ||
        node.type === "augmented_assignment_expression" ||
        node.type === "for_in_statement"
      ? node.childForFieldName("left")
      : node.type === "update_expression"
        ? node
        : node.type === "variable_declarator"
          ? node.childForFieldName("name")
          : null;

    if (
      target !== null &&
      (mentionsIdentifier(target, name) || subscriptMayRebind(target, name))
    ) {
      return true;
    }

    return node.children.some(visit);
  };

  return visit(root);
}

function jsonScalar(text: string): JsonScalar | undefined {
  try {
    const value = JSON.parse(text) as unknown;
    const scalar = jsonScalarFromUnknown(value);

    return typeof scalar === "string" &&
      scalar.length > MAX_STAGED_TEXT_CHARACTERS
      ? undefined
      : scalar;
  } catch {
    // Unsupported TypeScript literals, such as single-quoted strings, fail closed.
  }

  return undefined;
}

function unwrapParentheses(text: string): string {
  let value = text.trim();

  while (value.startsWith("(") && value.endsWith(")")) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

function parseGuard(
  node: ParserNode,
  parameterName: string,
): { readonly text: string; readonly value: JsonScalar } | null {
  const text = unwrapParentheses(node.text);
  const match = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*===\s*(.+)$/.exec(text);

  if (match === null || match[1] !== parameterName || match[2] === undefined) {
    return null;
  }

  const value = jsonScalar(match[2].trim());
  return value === undefined
    ? null
    : {
      text: `${parameterName} === ${JSON.stringify(value)}`,
      value,
    };
}

function returnExpression(
  statement: ParserNode,
): { readonly text: string; readonly value: JsonScalar } | null {
  if (statement.type !== "return_statement" || statement.namedChildren.length !== 1) {
    return null;
  }

  const expression = statement.namedChildren[0];

  if (expression === undefined) {
    return null;
  }

  const value = jsonScalar(expression.text.trim());
  return value === undefined
    ? null
    : {
      text: expression.text.trim(),
      value,
    };
}

function singleReturn(statement: ParserNode): ParserNode | null {
  if (statement.type === "return_statement") {
    return statement;
  }

  if (statement.type !== "statement_block" || statement.namedChildren.length !== 1) {
    return null;
  }

  return statement.namedChildren[0]?.type === "return_statement"
    ? statement.namedChildren[0] ?? null
    : null;
}

function parseFunction(functionNode: ParserNode): PilotParserResponse {
  if (
    functionNode.text.trimStart().startsWith("async ") ||
    functionNode.children.some(
      (child) => child.type === "async" || child.type === "*",
    )
  ) {
    return { kind: "unsupported" };
  }

  const nameNode = functionNode.childForFieldName("name");
  const parametersNode = functionNode.childForFieldName("parameters");
  const bodyNode = functionNode.childForFieldName("body");

  if (nameNode === null || parametersNode === null || bodyNode === null) {
    return { kind: "unsupported" };
  }

  const entityName = nameNode.text.trim();
  const parameterMatch =
    /^\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=,)]+)?\s*\)$/.exec(
      parametersNode.text,
    );

  if (!IDENTIFIER_PATTERN.test(entityName) || parameterMatch?.[1] === undefined) {
    return { kind: "unsupported" };
  }

  const parameterName = parameterMatch[1];
  const statements = bodyNode.namedChildren;

  if (statements.length !== 2) {
    return { kind: "unsupported" };
  }

  const ifNode = statements[0];
  const fallbackReturnNode = statements[1];

  if (
    ifNode?.type !== "if_statement" ||
    fallbackReturnNode?.type !== "return_statement" ||
    ifNode.childForFieldName("alternative") !== null
  ) {
    return { kind: "unsupported" };
  }

  const conditionNode = ifNode.childForFieldName("condition");
  const consequenceNode = ifNode.childForFieldName("consequence");

  if (conditionNode === null || consequenceNode === null) {
    return { kind: "unsupported" };
  }

  const guardedReturnNode = singleReturn(consequenceNode);
  const guard = parseGuard(conditionNode, parameterName);
  const guardedReturn =
    guardedReturnNode === null ? null : returnExpression(guardedReturnNode);
  const fallbackReturn = returnExpression(fallbackReturnNode);

  if (
    guardedReturnNode === null ||
    guard === null ||
    guardedReturn === null ||
    fallbackReturn === null
  ) {
    return { kind: "unsupported" };
  }

  const invocation = `${entityName}(${JSON.stringify(guard.value)})`;
  const derivedStrings = [
    entityName,
    parameterName,
    guard.text,
    guardedReturn.text,
    invocation,
    `${guard.text} -> return ${JSON.stringify(guardedReturn.value)}`,
  ];

  if (
    derivedStrings.some(
      (value) => value.length > MAX_STAGED_TEXT_CHARACTERS,
    )
  ) {
    return { kind: "unsupported" };
  }

  return {
    kind: "supported",
    entity_name: entityName,
    parameter_name: parameterName,
    guard_text: guard.text,
    guard_value: guard.value,
    return_text: guardedReturn.text,
    return_value: guardedReturn.value,
    invocation,
    entity_range: range(functionNode),
    guard_range: range(conditionNode),
    return_range: range(guardedReturnNode),
  };
}

function parse(input: ParserInput): PilotParserResponse {
  const registration = TYPESCRIPT_LANGUAGE_REGISTRATIONS[0];

  if (registration === undefined) {
    return { kind: "unsupported" };
  }

  const parser = new TreeSitterParser();
  parser.setLanguage(registration.load_language());
  const tree = parser.parse(input.source);

  if (tree.rootNode.type !== "program" || tree.rootNode.hasError === true) {
    return tree.rootNode.hasError === true
      ? { kind: "unsupported", reason: "syntax_error" }
      : { kind: "unsupported" };
  }

  const functions = topLevelFunctions(tree.rootNode);
  const functionNode = functions.length === 1 ? functions[0] : undefined;
  if (functionNode === undefined) {
    return { kind: "unsupported" };
  }

  const name = functionNode.childForFieldName("name")?.text.trim() ?? "";
  return name.length > 0 &&
      (
        writesBinding(tree.rootNode, name) ||
        containsDirectEval(tree.rootNode) ||
        containsCallOutside(tree.rootNode, functionNode) ||
        containsSameNameFunction(tree.rootNode, functionNode, name)
      )
    ? { kind: "unsupported" }
    : parseFunction(functionNode);
}

function containsSameNameFunction(
  root: ParserNode,
  functionNode: ParserNode,
  name: string,
): boolean {
  const expectedName = decodedIdentifier(name);
  const visit = (node: ParserNode): boolean => {
    if (node === functionNode) {
      return false;
    }

    if (
      node.type === "function_declaration" ||
      node.type === "generator_function_declaration"
    ) {
      const declared = node.childForFieldName("name")?.text ?? "";
      if (decodedIdentifier(declared) === expectedName) {
        return true;
      }
    }

    return node.children.some(visit);
  };

  return visit(root);
}

function containsCallOutside(
  root: ParserNode,
  functionNode: ParserNode,
): boolean {
  const visit = (node: ParserNode): boolean => {
    if (node === functionNode) {
      return false;
    }

    if (node.type === "call_expression" || node.type === "new_expression") {
      return true;
    }

    return node.children.some(visit);
  };

  return visit(root);
}

function main(): void {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8")) as ParserInput;
    const response =
      typeof input.source === "string"
        ? parse(input)
        : ({ kind: "unsupported" } as const);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch {
    process.stdout.write(
      `${JSON.stringify({ kind: "failed", reason: "parse_failed" })}\n`,
    );
  }
}

main();
