import type { GradeVerdict } from "@/lib/grading/verdict";
import { VERDICT_DISCLAIMER } from "@/lib/grading/verdict";
import { SpeakButton } from "@/components/ui/SpeakButton";

interface GradeVerdictCardProps {
  verdict: GradeVerdict;
}

const RECOMMENDATION_CLASSES: Record<GradeVerdict["recommendation"], string> = {
  Grade: "border-emerald-500/40 bg-emerald-900/30 text-emerald-300",
  Borderline: "border-amber-500/40 bg-amber-900/30 text-amber-200",
  "Sell Raw": "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  "Rescan Needed": "border-rose-500/40 bg-rose-900/30 text-rose-200",
};

function VerdictField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--biz-text)]">{value}</p>
    </div>
  );
}

export function GradeVerdictCard({ verdict }: GradeVerdictCardProps) {
  const verdictSpeechText = [
    `Recommendation: ${verdict.recommendation}.`,
    `Suggested grader: ${verdict.suggestedGrader}.`,
    `Expected outcome: ${verdict.expectedOutcome}.`,
    `Strategy: ${verdict.strategyTip}.`,
    verdict.reasoning ? `Reasoning: ${verdict.reasoning}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="border-b border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)] px-5 py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
          THE VERDICT
        </h4>
        <div className="flex items-center gap-2">
          <SpeakButton
            text={verdictSpeechText}
            size="sm"
            className="border border-[var(--biz-border)] bg-transparent text-[var(--biz-muted)] hover:bg-[var(--biz-surface)]"
          />
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${RECOMMENDATION_CLASSES[verdict.recommendation]}`}
          >
            {verdict.recommendation}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <VerdictField label="Recommendation" value={verdict.recommendation} />
        <VerdictField label="Suggested Grader" value={verdict.suggestedGrader} />
        <VerdictField label="Expected Outcome" value={verdict.expectedOutcome} />
        <VerdictField label="Strategy Tip" value={verdict.strategyTip} />
      </div>

      <div className="mt-3 rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
          Reasoning
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--biz-muted)]">{verdict.reasoning}</p>
      </div>

      <p className="mt-3 whitespace-pre-line text-[10px] leading-relaxed text-[var(--biz-muted)]">
        {VERDICT_DISCLAIMER}
      </p>
    </section>
  );
}
