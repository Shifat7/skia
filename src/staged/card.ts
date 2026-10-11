import type {
  PilotSupportedAnalysis,
  PredictionSession,
  ReturnValuePrediction,
  SealedPrediction,
  SourceCheckResult,
} from "./types.js";
import { formatRfc3339UtcSeconds } from "../time.js";
import { jsonScalarFromUnknown } from "./json-scalar.js";

function validInstant(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function createPredictionSession(
  analysis: PilotSupportedAnalysis,
): PredictionSession {
  let sealedPrediction: SealedPrediction | null = null;

  return {
    persistPrediction(
      prediction: ReturnValuePrediction,
      persist: (record: SealedPrediction) => void,
      sealedAt: Date = new Date(),
    ): SealedPrediction {
      if (sealedPrediction !== null) {
        throw new Error("prediction is already persisted and immutable");
      }

      if (!validInstant(sealedAt)) {
        throw new Error("prediction seal requires a finite timestamp");
      }
      const normalizedValue = jsonScalarFromUnknown(prediction.value);

      if (normalizedValue === undefined) {
        throw new Error("prediction must be a finite JSON scalar");
      }

      const candidate: SealedPrediction = {
        scenario: analysis.scenario,
        prediction: {
          ...prediction,
          value: normalizedValue,
        },
        sealed_at: formatRfc3339UtcSeconds(sealedAt),
      };

      persist(candidate);
      sealedPrediction = candidate;
      return candidate;
    },

    sourceCheck(): SourceCheckResult {
      if (sealedPrediction === null) {
        throw new Error(
          "source-derived feedback requires a persisted prediction",
        );
      }

      const predicted = sealedPrediction.prediction.value;
      return Object.is(predicted, analysis.expected_return)
        ? {
          status: "source_derived_match",
          expected: analysis.expected_return,
          predicted,
        }
        : {
          status: "source_derived_mismatch",
          expected: analysis.expected_return,
          predicted,
        };
    },
  };
}
