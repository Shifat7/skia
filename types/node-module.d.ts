declare module "node:module" {
  export function createRequire(
    filename: string,
  ): (specifier: string) => unknown;
}

interface ImportMeta {
  readonly url: string;
}

declare class TextDecoder {
  constructor(
    label?: string,
    options?: {
      readonly fatal?: boolean;
    },
  );

  decode(input?: Uint8Array): string;
}
