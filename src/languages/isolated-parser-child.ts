import { createRequire } from "node:module";
import fs from "node:fs";
import process from "node:process";

import { PYTHON_LANGUAGE_REGISTRATION } from "./python.js";
import { summarizeParserTree } from "./parser-summary.js";
import type { LanguageParser, LanguageRegistration } from "./types.js";
import { TYPESCRIPT_LANGUAGE_REGISTRATIONS } from "./typescript.js";

const require = createRequire(import.meta.url);
type TreeSitterParserConstructor = new () => LanguageParser;
const TREE_SITTER_PARSER = require("tree-sitter") as TreeSitterParserConstructor;

interface ParserInput {
  readonly parser_id: string;
  readonly text: string;
  readonly content_bytes: readonly number[];
}

const registrations: readonly LanguageRegistration[] = [
  ...TYPESCRIPT_LANGUAGE_REGISTRATIONS,
  PYTHON_LANGUAGE_REGISTRATION,
];

function main(): void {
  const input = JSON.parse(String(fs.readFileSync(0, "utf8"))) as ParserInput;
  const registration = registrations.find((candidate) => candidate.parser_id === input.parser_id);

  if (registration === undefined) {
    process.stdout.write(`${JSON.stringify({ kind: "failed", reason: "parser_initialization_failed" })}\n`);
    return;
  }

  try {
    const parser = new TREE_SITTER_PARSER();
    parser.setLanguage(registration.load_language());
    const tree = parser.parse(input.text);
    const summary = summarizeParserTree(
      registration,
      tree.rootNode,
      input.text,
      Uint8Array.from(input.content_bytes),
    );
    process.stdout.write(`${JSON.stringify({ kind: "parsed", summary })}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ kind: "failed", reason: "parse_failed" })}\n`);
  }
}

main();
