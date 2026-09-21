#!/usr/bin/env node

import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { MAX_TERMINAL_INPUT_BYTES } from "./limits.js";
import {
  runStagedReview,
  type StagedReviewRunOptions,
  type StagedReviewRunResult,
} from "./staged/run.js";

export const COMMAND_SURFACES = [
  "review",
  "repo review",
  "runs list",
  "runs inspect",
  "runs delete",
] as const;

export interface CliShell {
  readonly commandName: "skia";
  readonly commandSurfaces: readonly string[];
  readonly implemented: "partial";
  readonly implementedCommandSurfaces: readonly ["review"];
}

export interface UnimplementedShellResult {
  readonly argv: readonly string[];
  readonly exit_code: 2;
  readonly kind: "unimplemented_shell";
  readonly output: string;
}

export type CliRunOptions = StagedReviewRunOptions;
export type ReviewCliResult = StagedReviewRunResult;

export type CliResult = UnimplementedShellResult | ReviewCliResult;

export function createCliShell(): CliShell {
  return {
    commandName: "skia",
    commandSurfaces: [...COMMAND_SURFACES],
    implemented: "partial",
    implementedCommandSurfaces: ["review"],
  };
}

export function runCli(
  argv: readonly string[] = [],
  options: CliRunOptions = {},
): CliResult {
  if (argv.length === 1 && argv[0] === "review") {
    return runStagedReview(options);
  }

  return {
    argv: [...argv],
    exit_code: 2,
    kind: "unimplemented_shell",
    output: `Command is not implemented: ${argv.join(" ") || "(none)"}\n`,
  };
}

function readBoundedTerminalLine(): string {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (totalBytes <= MAX_TERMINAL_INPUT_BYTES) {
    const chunk = Buffer.alloc(
      Math.min(256, MAX_TERMINAL_INPUT_BYTES + 1 - totalBytes),
    );
    const bytesRead = fs.readSync(0, chunk, 0, chunk.byteLength, null);

    if (bytesRead === 0) {
      break;
    }

    const bytes = chunk.subarray(0, bytesRead);
    chunks.push(Buffer.from(bytes));
    totalBytes += bytesRead;

    if (bytes.includes(0x0a)) {
      break;
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

const runtimeProcess = process as unknown as {
  readonly argv?: readonly string[];
  exitCode?: number;
};
const executablePath = runtimeProcess.argv?.[1];

if (
  executablePath !== undefined &&
  path.resolve(executablePath) === path.resolve(fileURLToPath(import.meta.url))
) {
  const result = runCli(runtimeProcess.argv?.slice(2) ?? [], {
    read_input: (prompt) => {
      process.stdout.write(prompt);
      return readBoundedTerminalLine();
    },
  });
  process.stdout.write(result.output);
  runtimeProcess.exitCode = result.exit_code;
}
