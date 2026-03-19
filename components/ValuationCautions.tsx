"use client";

interface ValuationCautionsProps {
  confidenceBand?: "high" | "medium" | "low" | "very_low";
  confidenceScore?: number;
  confidenceExplanation?: string;
  disclaimerMessages?: string[];
  includeReasonSummary?: string[];
  excludeReasonSummary?: string[];
}

function bandClass(
  confidenceBand: "high" | "medium" | "low" | "very_low" | undefined
): string {
  if (confidenceBand === "high") return "border-emerald-700/60 bg-emerald-900/20";
  if (confidenceBand === "medium") return "border-blue-700/60 bg-blue-900/20";
  if (confidenceBand === "low") return "border-amber-700/60 bg-amber-900/20";
  return "border-rose-700/60 bg-rose-900/20";
}

export default function ValuationCautions({
  confidenceBand,
  confidenceScore,
  confidenceExplanation,
  disclaimerMessages,
  includeReasonSummary,
  excludeReasonSummary,
}: ValuationCautionsProps) {
  const hasDisclaimers = Array.isArray(disclaimerMessages) && disclaimerMessages.length > 0;
  const hasConfidence = typeof confidenceScore === "number";
  if (!hasDisclaimers && !hasConfidence) return null;

  return (
    <div className={`rounded-xl border p-4 ${bandClass(confidenceBand)}`}>
      {hasConfidence && (
        <div className="mb-3">
          <p className="text-sm text-gray-200">
            Confidence:{" "}
            <span className="font-semibold uppercase tracking-wide">
              {confidenceBand?.replace("_", " ") ?? "unknown"}
            </span>
            {" "}
            ({confidenceScore})
          </p>
          {confidenceExplanation && (
            <p className="text-xs text-gray-300 mt-1">{confidenceExplanation}</p>
          )}
        </div>
      )}

      {hasDisclaimers && (
        <div className="space-y-2">
          {disclaimerMessages!.slice(0, 4).map((message) => (
            <p key={message} className="text-xs text-gray-300">
              {message}
            </p>
          ))}
        </div>
      )}

      {(includeReasonSummary?.length || excludeReasonSummary?.length) && (
        <div className="mt-3 pt-3 border-t border-gray-700/60 grid gap-2 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-gray-300 mb-1">Why listings were included</p>
            {(includeReasonSummary ?? []).slice(0, 3).map((reason) => (
              <p key={reason} className="text-xs text-gray-400">{reason}</p>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-300 mb-1">Why listings were excluded</p>
            {(excludeReasonSummary ?? []).slice(0, 3).map((reason) => (
              <p key={reason} className="text-xs text-gray-400">{reason}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
