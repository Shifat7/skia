declare module "node:assert/strict" {
  export function ok(value: unknown, message?: string | Error): void;
  export function deepStrictEqual(
    actual: unknown,
    expected: unknown,
    message?: string | Error,
  ): void;
  export function throws(
    fn: () => unknown,
    error?: RegExp | { new (...args: readonly unknown[]): Error },
    message?: string | Error,
  ): void;
  export function match(
    value: string,
    regExp: RegExp,
    message?: string | Error,
  ): void;
  export function notStrictEqual(
    actual: unknown,
    expected: unknown,
    message?: string | Error,
  ): void;
  export function strictEqual<T>(
    actual: T,
    expected: T,
    message?: string | Error,
  ): void;

  const assert: {
    ok: typeof ok;
    deepStrictEqual: typeof deepStrictEqual;
    throws: typeof throws;
    match: typeof match;
    notStrictEqual: typeof notStrictEqual;
    strictEqual: typeof strictEqual;
  };

  export default assert;
}

declare module "node:fs" {
  export interface MakeDirectoryOptions {
    readonly mode?: number;
    readonly recursive?: boolean;
  }

  export interface WriteFileOptions {
    readonly encoding?: "utf8";
    readonly flag?: string;
    readonly mode?: number;
  }

  export interface ReaddirOptions {
    readonly encoding?: "utf8";
  }

  export interface Stats {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    readonly size: number;
    readonly mode: number;
  }

  export function chmodSync(path: string, mode: number): void;
  export function existsSync(path: string): boolean;
  export function lstatSync(path: string): Stats;
  export function mkdirSync(path: string, options?: number | MakeDirectoryOptions): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function openSync(path: string, flags: string, mode?: number): number;
  export function renameSync(oldPath: string, newPath: string): void;
  export function closeSync(fd: number): void;
  export function fsyncSync(fd: number): void;
  export function writeSync(
    fd: number,
    data: string | Uint8Array,
    position?: number,
    encoding?: "utf8",
  ): number;
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string, options?: ReaddirOptions): readonly string[];
  export function realpathSync(path: string): string;
  export function rmSync(
    path: string,
    options?: {
      readonly force?: boolean;
      readonly recursive?: boolean;
    },
  ): void;
  export function rmdirSync(path: string): void;
  export function statSync(path: string): Stats;
  export function symlinkSync(target: string, path: string): void;
  export function unlinkSync(path: string): void;
  export function writeFileSync(
    path: string,
    data: string | Uint8Array,
    options?: WriteFileOptions | "utf8",
  ): void;

  const fs: {
    chmodSync: typeof chmodSync;
    existsSync: typeof existsSync;
    lstatSync: typeof lstatSync;
    mkdirSync: typeof mkdirSync;
    mkdtempSync: typeof mkdtempSync;
    openSync: typeof openSync;
    renameSync: typeof renameSync;
    closeSync: typeof closeSync;
    fsyncSync: typeof fsyncSync;
    writeSync: typeof writeSync;
    readFileSync: typeof readFileSync;
    readdirSync: typeof readdirSync;
    realpathSync: typeof realpathSync;
    rmSync: typeof rmSync;
    rmdirSync: typeof rmdirSync;
    statSync: typeof statSync;
    symlinkSync: typeof symlinkSync;
    unlinkSync: typeof unlinkSync;
    writeFileSync: typeof writeFileSync;
  };

  export default fs;
}

declare module "node:path" {
  export interface PathPlatform {
    isAbsolute(path: string): boolean;
    join(...parts: readonly string[]): string;
    normalize(path: string): string;
  }

  export function join(...parts: readonly string[]): string;
  export function dirname(path: string): string;
  export function resolve(...parts: readonly string[]): string;
  export const posix: PathPlatform;
  export const win32: PathPlatform;

  const path: {
    join: typeof join;
    dirname: typeof dirname;
    resolve: typeof resolve;
    posix: typeof posix;
    win32: typeof win32;
  };

  export default path;
}

declare module "node:os" {
  export function tmpdir(): string;

  const os: {
    readonly tmpdir: typeof tmpdir;
  };

  export default os;
}

declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static alloc(size: number): Buffer;
    static concat(list: readonly Uint8Array[]): Buffer;
    static from(value: string, encoding?: "utf8"): Buffer;
    static from(value: readonly number[]): Buffer;
    static from(value: Uint8Array): Buffer;
    toString(encoding?: "utf8"): string;
  }
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string | Uint8Array, encoding?: "utf8"): Hash;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: "sha256"): Hash;
}

declare module "node:util" {
  export function isDeepStrictEqual(actual: unknown, expected: unknown): boolean;
}

declare module "node:process" {
  const process: {
    cwd(): string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly pid: number;
    readonly platform: string;
  };

  export default process;
}

declare module "node:child_process" {
  export interface SpawnSyncOptions {
    readonly cwd?: string;
    readonly encoding?: "utf8";
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly input?: string | Uint8Array;
    readonly maxBuffer?: number;
    readonly shell?: boolean;
    readonly timeout?: number;
  }

  export interface SpawnSyncReturns<TStdout = string | Uint8Array> {
    readonly error?: Error;
    readonly output: readonly (TStdout | null)[];
    readonly pid: number;
    readonly signal: string | null;
    readonly status: number | null;
    readonly stdout: TStdout;
    readonly stderr: TStdout;
  }

  export function spawnSync(
    command: string,
    args?: readonly string[],
    options?: SpawnSyncOptions,
  ): SpawnSyncReturns;
}

declare module "node:test" {
  export type TestFn = () => void | Promise<void>;

  export default function test(name: string, fn: TestFn): void;
}
