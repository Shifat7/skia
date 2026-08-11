import { createRequire } from "node:module";

import type { LanguageRegistration, VersionedPackage } from "./types.js";

const require = createRequire(import.meta.url);

interface TreeSitterLanguageModule {
  readonly name: string;
  readonly language: unknown;
}

interface TypeScriptLanguageBinding {
  readonly typescript: TreeSitterLanguageModule;
  readonly tsx: TreeSitterLanguageModule;
}

const treeSitterTypeScript = require("tree-sitter-typescript") as TypeScriptLanguageBinding;

const TREE_SITTER_PARSER: VersionedPackage = Object.freeze({
  name: "tree-sitter",
  version: "0.21.1",
});

const TYPESCRIPT_GRAMMAR: VersionedPackage = Object.freeze({
  name: "tree-sitter-typescript",
  version: "0.23.2",
});

export const TYPESCRIPT_LANGUAGE_REGISTRATIONS = Object.freeze([
  {
    extension: ".ts",
    language: "typescript",
    dialect_id: "typescript",
    parser_id: "tree-sitter-typescript.typescript",
    parser: TREE_SITTER_PARSER,
    grammar: TYPESCRIPT_GRAMMAR,
    load_language: () => treeSitterTypeScript.typescript,
  },
  {
    extension: ".tsx",
    language: "tsx",
    dialect_id: "tsx",
    parser_id: "tree-sitter-typescript.tsx",
    parser: TREE_SITTER_PARSER,
    grammar: TYPESCRIPT_GRAMMAR,
    load_language: () => treeSitterTypeScript.tsx,
  },
] as const satisfies readonly LanguageRegistration[]);
