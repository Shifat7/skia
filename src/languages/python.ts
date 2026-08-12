import { createRequire } from "node:module";

import type { LanguageRegistration, VersionedPackage } from "./types.js";

const require = createRequire(import.meta.url);

interface TreeSitterLanguageModule {
  readonly name: string;
  readonly language: unknown;
}

const treeSitterPython = require("tree-sitter-python") as TreeSitterLanguageModule;

const TREE_SITTER_PARSER: VersionedPackage = Object.freeze({
  name: "tree-sitter",
  version: "0.21.1",
});

const PYTHON_GRAMMAR: VersionedPackage = Object.freeze({
  name: "tree-sitter-python",
  version: "0.21.0",
});

export const PYTHON_LANGUAGE_REGISTRATION = Object.freeze({
  extension: ".py",
  language: "python",
  dialect_id: "python",
  parser_id: "tree-sitter-python",
  parser: TREE_SITTER_PARSER,
  grammar: PYTHON_GRAMMAR,
  load_language: () => treeSitterPython,
}) satisfies LanguageRegistration;
