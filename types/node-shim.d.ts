declare module "node:assert/strict" {
  export function deepStrictEqual(
    actual: unknown,
    expected: unknown,
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
    deepStrictEqual: typeof deepStrictEqual;
    notStrictEqual: typeof notStrictEqual;
    strictEqual: typeof strictEqual;
  };

  export default assert;
}

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;

  const fs: {
    readFileSync: typeof readFileSync;
  };

  export default fs;
}

declare module "node:path" {
  export function join(...parts: readonly string[]): string;

  const path: {
    join: typeof join;
  };

  export default path;
}

declare module "node:process" {
  const process: {
    cwd(): string;
  };

  export default process;
}

declare module "node:test" {
  export type TestFn = () => void | Promise<void>;

  export default function test(name: string, fn: TestFn): void;
}
