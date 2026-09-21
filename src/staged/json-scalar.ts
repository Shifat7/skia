import type { JsonScalar } from "../types.js";

export function jsonScalarFromUnknown(value: unknown): JsonScalar | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : value;
  }

  return undefined;
}
