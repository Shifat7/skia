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
  export function linkSync(existingPath: string, newPath: string): void;
  export function mkdirSync(path: string, options?: number | MakeDirectoryOptions): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function openSync(path: string, flags: string | number, mode?: number): number;
  export function renameSync(oldPath: string, newPath: string): void;
  export function closeSync(fd: number): void;
  export function fstatSync(fd: number): Stats;
  export function fsyncSync(fd: number): void;
  export function readSync(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): number;
  export function writeSync(
    fd: number,
    data: string | Uint8Array,
    position?: number,
    encoding?: "utf8",
  ): number;
  export function readFileSync(path: string | number): Uint8Array;
  export function readFileSync(path: number, encoding: "utf8"): string;
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

  export const constants: {
    readonly O_NOFOLLOW: number;
    readonly O_RDONLY: number;
  };
  export function writeFileSync(
    path: string,
    data: string | Uint8Array,
    options?: WriteFileOptions | "utf8",
  ): void;

  const fs: {
    chmodSync: typeof chmodSync;
    existsSync: typeof existsSync;
    lstatSync: typeof lstatSync;
    linkSync: typeof linkSync;
    mkdirSync: typeof mkdirSync;
    mkdtempSync: typeof mkdtempSync;
    openSync: typeof openSync;
    renameSync: typeof renameSync;
    closeSync: typeof closeSync;
    fstatSync: typeof fstatSync;
    fsyncSync: typeof fsyncSync;
    readSync: typeof readSync;
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
    constants: typeof constants;
  };

  export default fs;
}

declare class URL {
  constructor(url: string, base?: string | URL);
  readonly pathname: string;
}

declare module "node:path" {
  export interface PathPlatform {
    isAbsolute(path: string): boolean;
    join(...parts: readonly string[]): string;
    normalize(path: string): string;
  }

  export function isAbsolute(path: string): boolean;
  export function join(...parts: readonly string[]): string;
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: readonly string[]): string;
  export const delimiter: string;
  export const sep: string;
  export const posix: PathPlatform;
  export const win32: PathPlatform;

  const path: {
    delimiter: typeof delimiter;
    isAbsolute: typeof isAbsolute;
    join: typeof join;
    dirname: typeof dirname;
    relative: typeof relative;
    resolve: typeof resolve;
    sep: typeof sep;
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
    toString(encoding?: "utf8" | "hex"): string;
  }
}

declare module "node:crypto" {
  export interface Hash {
    update(data: string | Uint8Array, encoding?: "utf8"): Hash;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: "sha1" | "sha256"): Hash;
  export function randomBytes(size: number): import("node:buffer").Buffer;
}

declare module "node:util" {
  export function isDeepStrictEqual(actual: unknown, expected: unknown): boolean;
}

declare module "node:process" {
  const process: {
    cwd(): string;
    stdout: {
      write(value: string): void;
    };
    stderr: {
      write(value: string): void;
    };
    stdin: {
      on(event: "data", listener: (chunk: Uint8Array) => void): void;
      on(event: "end", listener: () => void): void;
      on(event: "error", listener: (error: Error) => void): void;
      off(event: "data", listener: (chunk: Uint8Array) => void): void;
      off(event: "end", listener: () => void): void;
      off(event: "error", listener: (error: Error) => void): void;
      pause(): void;
      resume(): void;
    };
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly pid: number;
    readonly platform: string;
    on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
    off(event: "SIGINT" | "SIGTERM", listener: () => void): void;
    listenerCount(event: "SIGINT" | "SIGTERM"): number;
    exit(code: number): never;
  };

  export default process;
}

declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
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

  export interface SpawnedProcess {
    stdout: {
      on(event: "data", listener: (chunk: Uint8Array) => void): void;
    };
    stderr: {
      on(event: "data", listener: (chunk: Uint8Array) => void): void;
    };
    on(
      event: "exit",
      listener: (code: number | null, signal: string | null) => void,
    ): void;
    kill(signal?: string): boolean;
  }

  export function spawn(
    command: string,
    args?: readonly string[],
    options?: SpawnSyncOptions,
  ): SpawnedProcess;

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
