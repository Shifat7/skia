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
const TERMINAL_INPUT_DECODER = new TextDecoder("utf-8", { fatal: true });

export function createCliShell(): CliShell {
  return {
    commandName: "skia",
    commandSurfaces: [...COMMAND_SURFACES],
    implemented: "partial",
    implementedCommandSurfaces: ["review"],
  };
}

export function runCli(
  argv?: readonly string[],
  options?: CliRunOptions & {
    readonly read_input?: (prompt: string) => string;
  },
): CliResult;
export function runCli(
  argv: readonly string[],
  options: CliRunOptions & {
    readonly read_input: (prompt: string) => Promise<string>;
  },
): Promise<CliResult>;
export function runCli(
  argv?: readonly string[],
  options?: CliRunOptions,
): CliResult | Promise<CliResult>;
export function runCli(
  argv: readonly string[] = [],
  options: CliRunOptions = {},
): CliResult | Promise<CliResult> {
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

function readBoundedTerminalLine(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.pause();

      try {
        resolve(TERMINAL_INPUT_DECODER.decode(Buffer.concat(chunks)));
      } catch {
        resolve("");
      }
    };

    const onData = (chunk: Uint8Array): void => {
      const bytes = Buffer.from(chunk);
      const newlineAt = bytes.indexOf(0x0a);
      const line = newlineAt === -1 ? bytes : bytes.subarray(0, newlineAt + 1);
      const remaining = MAX_TERMINAL_INPUT_BYTES + 1 - totalBytes;
      const limited = line.subarray(0, Math.max(0, remaining));
      chunks.push(Buffer.from(limited));
      totalBytes += limited.byteLength;

      if (newlineAt !== -1 || totalBytes > MAX_TERMINAL_INPUT_BYTES) {
        finish();
      }
    };

    const onEnd = (): void => {
      finish();
    };

    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.resume();
  });
}

const runtimeProcess = process as unknown as {
  readonly argv?: readonly string[];
  exitCode?: number;
};
const executablePath = runtimeProcess.argv?.[1];

function resolvesToCliEntry(candidate: string): boolean {
  try {
    return (
      fs.realpathSync(path.resolve(candidate)) ===
      fs.realpathSync(path.resolve(fileURLToPath(import.meta.url)))
    );
  } catch {
    return false;
  }
}

if (
  executablePath !== undefined &&
  resolvesToCliEntry(executablePath)
) {
  void Promise.resolve(runCli(runtimeProcess.argv?.slice(2) ?? [], {
    read_input: (prompt) => {
      process.stdout.write(prompt);
      return readBoundedTerminalLine();
    },
  })).then((result) => {
    process.stdout.write(result.output);
    runtimeProcess.exitCode = result.exit_code;
  });
}
