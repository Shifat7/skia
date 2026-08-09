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

declare module "node:test" {
  export type TestFn = () => void | Promise<void>;

  export default function test(name: string, fn: TestFn): void;
}
