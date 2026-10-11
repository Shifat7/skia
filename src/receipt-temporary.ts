import { randomBytes } from "node:crypto";

let reservedStagedReceiptTemporarySuffix: string | null = null;

function randomStagedReceiptTemporarySuffix(): string {
  return randomBytes(16).toString("hex");
}

export function nextStagedReceiptTemporarySuffix(): string {
  reservedStagedReceiptTemporarySuffix ??= randomStagedReceiptTemporarySuffix();
  return reservedStagedReceiptTemporarySuffix;
}

export function allocateStagedReceiptTemporarySuffix(): string {
  const suffix = reservedStagedReceiptTemporarySuffix ?? randomStagedReceiptTemporarySuffix();
  reservedStagedReceiptTemporarySuffix = null;
  return suffix;
}
