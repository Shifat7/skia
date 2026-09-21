export function gateStatus(code: string): string {
  if (code === "ready") {
    return "ok";
  }

  return "hold";
}
