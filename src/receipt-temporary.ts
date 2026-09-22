import process from "node:process";

let stagedReceiptTemporaryCounter = 0;

export function nextStagedReceiptTemporarySuffix(): string {
  return `${process.pid}-${stagedReceiptTemporaryCounter + 1}`;
}

export function allocateStagedReceiptTemporarySuffix(): string {
  stagedReceiptTemporaryCounter += 1;
  return `${process.pid}-${stagedReceiptTemporaryCounter}`;
}
