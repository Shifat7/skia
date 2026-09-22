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

export function terminalPredictionPayload(line: Uint8Array): Uint8Array {
  let end = line.byteLength;

  if (end > 0 && line[end - 1] === 0x0a) {
    end -= 1;
    if (end > 0 && line[end - 1] === 0x0d) {
      end -= 1;
    }
  }

  return line.subarray(0, end);
}

interface TerminalInputStream {
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  off(event: "data", listener: (chunk: Uint8Array) => void): void;
  off(event: "end", listener: () => void): void;
  off(event: "error", listener: (error: Error) => void): void;
  pause(): void;
  resume(): void;
}

export function readBoundedTerminalLineFrom(
  stream: TerminalInputStream,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const stop = (): void => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
      stream.pause();
    };

    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      stop();

      try {
        resolve(TERMINAL_INPUT_DECODER.decode(Buffer.concat(chunks)));
      } catch {
        resolve("");
      }
    };

    const onError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      stop();
      reject(error);
    };

    const onData = (chunk: Uint8Array): void => {
      const bytes = Buffer.from(chunk);
      const newlineAt = bytes.indexOf(0x0a);
      const line = newlineAt === -1 ? bytes : bytes.subarray(0, newlineAt + 1);
      const payload = terminalPredictionPayload(line);
      const remaining = MAX_TERMINAL_INPUT_BYTES + 1 - totalBytes;
      const limited = payload.subarray(0, Math.max(0, remaining));
      chunks.push(Buffer.from(limited));
      totalBytes += limited.byteLength;

      if (newlineAt !== -1 || totalBytes > MAX_TERMINAL_INPUT_BYTES) {
        finish();
      }
    };

    const onEnd = (): void => {
      finish();
    };

    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
    stream.resume();
  });
}

function readBoundedTerminalLine(): Promise<string> {
  return readBoundedTerminalLineFrom(process.stdin);
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
