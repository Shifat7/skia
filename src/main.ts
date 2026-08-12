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
  readonly implemented: false;
}

export interface UnimplementedShellResult {
  readonly argv: readonly string[];
  readonly kind: "unimplemented_shell";
}

export function createCliShell(): CliShell {
  return {
    commandName: "skia",
    commandSurfaces: [...COMMAND_SURFACES],
    implemented: false,
  };
}

export function runCli(argv: readonly string[] = []): UnimplementedShellResult {
  return {
    argv: [...argv],
    kind: "unimplemented_shell",
  };
}
