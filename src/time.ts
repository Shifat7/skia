export function formatRfc3339UtcSeconds(value: Date): string {
  const milliseconds = value.getTime();

  if (!Number.isFinite(milliseconds)) {
    throw new Error("timestamp requires a finite instant");
  }

  return new Date(Math.floor(milliseconds / 1_000) * 1_000)
    .toISOString()
    .replace(".000Z", "Z");
}
