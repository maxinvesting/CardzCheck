import { Suspense } from "react";
import DealCalculator from "@/components/business/DealCalculator";

export const metadata = {
  title: "Deal Calculator — CardzCheck Business",
  description: "Multi-platform fee calculator for trading card sales. Compare net proceeds across eBay, Whatnot, COMC, and more.",
};

function LoadingFallback() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-slate-100" />
      <div className="h-64 rounded-xl bg-slate-100" />
    </div>
  );
}

export default function DealCalculatorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--biz-text)] leading-snug">Deal Calculator</h1>
        <p className="mt-1 text-sm text-[var(--biz-muted)]">
          Compare net proceeds across platforms or analyze a buy/flip opportunity. No AI — just accurate fee math.
        </p>
      </div>

      <Suspense fallback={<LoadingFallback />}>
        <DealCalculator />
      </Suspense>
    </div>
  );
}
