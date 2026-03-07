"use client";

import { useMemo, useState, useEffect } from "react";
import {
  calcEbay,
  calcEbayBreakEven,
  calcWhatnot,
  calcWhatnotBreakEven,
  calcCOMC,
  calcCOMCBreakEven,
  calcPersonalWebsite,
  calcPersonalWebsiteBreakEven,
  calcCardShow,
  calcCardShowBreakEven,
  calcFacebook,
  calcFacebookBreakEven,
  fmt$,
  ALL_PLATFORMS,
  PLATFORM_NAMES,
  type PlatformId,
  type PlatformResult,
} from "@/lib/business/platform-fee-calculator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function numInput(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function clamp0(n: number): number {
  return Math.max(0, n);
}

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

const EBAY_FEE_STORAGE_KEY = "cardzcheck_ebay_fee_profile";

function readEbayProfile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(EBAY_FEE_STORAGE_KEY) === "top_rated_plus";
  } catch {
    return false;
  }
}

// ─── Input component ──────────────────────────────────────────────────────────

function DollarInput({
  label,
  value,
  onChange,
  placeholder = "0.00",
  hint,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[var(--biz-muted)] mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--biz-muted)] text-xs">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[color:var(--biz-border)] bg-[var(--biz-surface)] pl-6 pr-3 py-2 text-sm text-[var(--biz-text)] placeholder:text-[var(--biz-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)] focus:border-[var(--biz-primary)]"
        />
      </div>
      {hint && <p className="mt-1 text-[10px] text-[var(--biz-muted)]">{hint}</p>}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder = "",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[var(--biz-muted)] mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[color:var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-sm text-[var(--biz-text)] placeholder:text-[var(--biz-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)] focus:border-[var(--biz-primary)]"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 mt-0.5 inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-[var(--biz-primary)]" : "bg-[var(--biz-border)] border border-[color:var(--biz-border)]"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <span className="text-xs text-[var(--biz-text)]">{label}</span>
        {hint && <p className="text-[10px] text-[var(--biz-muted)]">{hint}</p>}
      </div>
    </div>
  );
}

// ─── Sell Mode ────────────────────────────────────────────────────────────────

interface SellInputs {
  cardName: string;
  costBasis: string;
  gradingCost: string;
  shipping: string;
  // per-platform prices
  perPlatformPricing: boolean;
  globalSalePrice: string;
  platformPrices: Record<PlatformId, string>;
  // platform-specific toggles
  ebayTopRated: boolean;
  whatnotFlatShipping: boolean;
  facebookShipped: boolean;
  // card show
  cardShowTableCost: string;
  cardShowCards: string;
}

function defaultSellInputs(ebayTopRated: boolean): SellInputs {
  return {
    cardName: "",
    costBasis: "",
    gradingCost: "",
    shipping: "",
    perPlatformPricing: false,
    globalSalePrice: "",
    platformPrices: {
      ebay: "",
      whatnot: "",
      comc: "",
      personal_website: "",
      card_show: "",
      facebook: "",
    },
    ebayTopRated,
    whatnotFlatShipping: false,
    facebookShipped: false,
    cardShowTableCost: "",
    cardShowCards: "",
  };
}

function computeSellResults(inputs: SellInputs): PlatformResult[] {
  const costBasis = clamp0(numInput(inputs.costBasis)) + clamp0(numInput(inputs.gradingCost));
  const baseShipping = clamp0(numInput(inputs.shipping));

  function price(pid: PlatformId): number {
    if (inputs.perPlatformPricing) {
      return clamp0(numInput(inputs.platformPrices[pid]));
    }
    return clamp0(numInput(inputs.globalSalePrice));
  }

  const whatnotShipping = inputs.whatnotFlatShipping ? 4.99 : baseShipping;
  const tableAmortized = (() => {
    const tc = clamp0(numInput(inputs.cardShowTableCost));
    const cards = clamp0(numInput(inputs.cardShowCards));
    if (tc > 0 && cards > 0) return round2(tc / cards);
    return 0;
  })();

  return [
    calcEbay(price("ebay"), costBasis, baseShipping, inputs.ebayTopRated),
    calcWhatnot(price("whatnot"), costBasis, whatnotShipping),
    calcCOMC(price("comc"), costBasis),
    calcPersonalWebsite(price("personal_website"), costBasis, baseShipping),
    calcCardShow(price("card_show"), costBasis, tableAmortized),
    calcFacebook(price("facebook"), costBasis, baseShipping, inputs.facebookShipped),
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function PlatformResultCard({
  result,
  isWinner,
  isLoss,
  showFormula,
}: {
  result: PlatformResult;
  isWinner: boolean;
  isLoss: boolean;
  showFormula: boolean;
}) {
  const profitColor = isLoss
    ? "text-red-500"
    : result.profitDollars > 0
    ? "text-[var(--biz-primary)]"
    : "text-[var(--biz-muted)]";

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isWinner
          ? "border-[var(--biz-primary)] bg-[#f0fdf4] dark:bg-[#052e16]/30"
          : isLoss
          ? "border-red-300 bg-red-50 dark:bg-red-950/20"
          : "border-[color:var(--biz-border)] bg-[var(--biz-surface)]"
      }`}
    >
      {/* Platform name + winner badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-sm font-semibold text-[var(--biz-text)]">{result.platformName}</span>
        {isWinner && (
          <span className="rounded-full bg-[var(--biz-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
            Best Net
          </span>
        )}
        {isLoss && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            Loss
          </span>
        )}
      </div>

      {/* Key numbers grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
        <div>
          <p className="text-[10px] text-[var(--biz-muted)] uppercase tracking-normal">Gross Sale</p>
          <p className="text-sm font-medium text-[var(--biz-text)] tabular-nums">
            {fmt$(result.grossSalePrice)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--biz-muted)] uppercase tracking-normal">Net Proceeds</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--biz-text)]">
            {fmt$(result.netProceeds)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--biz-muted)] uppercase tracking-normal">Profit / Loss</p>
          <p className={`text-sm font-bold tabular-nums ${profitColor}`}>
            {fmt$(result.profitDollars)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--biz-muted)] uppercase tracking-normal">Return</p>
          <p className={`text-sm font-bold tabular-nums ${profitColor}`}>
            {pct(result.profitPercent)}
          </p>
        </div>
      </div>

      {/* Fee breakdown */}
      <div
        style={{ borderTop: "1px solid var(--biz-border)" }}
        className="pt-2.5 space-y-1"
      >
        {result.feeLines.map((line, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--biz-muted)]">
              {line.label}
              {line.note && (
                <span className="ml-1 opacity-60">({line.note})</span>
              )}
            </span>
            <span className="text-[11px] tabular-nums text-[var(--biz-text)]">
              {line.amount === 0 ? "—" : fmt$(line.amount)}
            </span>
          </div>
        ))}
        {result.shippingCost > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--biz-muted)]">Shipping</span>
            <span className="text-[11px] tabular-nums text-[var(--biz-text)]">{fmt$(result.shippingCost)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 font-medium">
          <span className="text-[11px] text-[var(--biz-muted)]">Total costs</span>
          <span className="text-[11px] tabular-nums text-[var(--biz-text)]">{fmt$(result.totalCosts)}</span>
        </div>
      </div>

      {/* Formula (expandable) */}
      {showFormula && result.formulaDescription && (
        <div
          style={{ borderTop: "1px solid var(--biz-border)" }}
          className="mt-2.5 pt-2.5"
        >
          <p className="text-[10px] text-[var(--biz-muted)] font-mono whitespace-pre-wrap leading-relaxed">
            {result.formulaDescription}
          </p>
        </div>
      )}
    </div>
  );
}

function SellMode({ initialTopRated }: { initialTopRated: boolean }) {
  const [inputs, setInputs] = useState<SellInputs>(() => defaultSellInputs(initialTopRated));
  const [showGrading, setShowGrading] = useState(false);
  const [showCardShow, setShowCardShow] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);

  const set = <K extends keyof SellInputs>(key: K, val: SellInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: val }));

  const setPlatformPrice = (pid: PlatformId, val: string) =>
    setInputs((prev) => ({
      ...prev,
      platformPrices: { ...prev.platformPrices, [pid]: val },
    }));

  const results = useMemo(() => computeSellResults(inputs), [inputs]);

  const validResults = results.filter((r) => r.grossSalePrice > 0);
  const winnerPid =
    validResults.length > 0
      ? validResults.reduce((best, r) => (r.netProceeds > best.netProceeds ? r : best))
          .platformId
      : null;

  const hasAnyInput =
    numInput(inputs.globalSalePrice) > 0 ||
    Object.values(inputs.platformPrices).some((p) => numInput(p) > 0);

  return (
    <div className="space-y-6">
      {/* ── Inputs panel ── */}
      <div
        style={{ border: "1px solid var(--biz-border)" }}
        className="rounded-xl bg-[var(--biz-surface)] p-5 space-y-5"
      >
        {/* Row 1: Card name */}
        <TextInput
          label="Card Name"
          value={inputs.cardName}
          onChange={(v) => set("cardName", v)}
          placeholder="e.g. 2020 Topps Chrome Patrick Mahomes #1"
        />

        {/* Row 2: Cost basis + grading toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DollarInput
            label="Cost Basis (purchase price)"
            value={inputs.costBasis}
            onChange={(v) => set("costBasis", v)}
            placeholder="0.00"
          />
          <div>
            {!showGrading ? (
              <div className="mt-5">
                <button
                  onClick={() => setShowGrading(true)}
                  className="text-xs text-[var(--biz-primary)] hover:underline"
                >
                  + Add grading cost
                </button>
              </div>
            ) : (
              <DollarInput
                label="Grading Cost (added to cost basis)"
                value={inputs.gradingCost}
                onChange={(v) => set("gradingCost", v)}
                placeholder="0.00"
                hint="PSA, BGS, SGC submission cost"
              />
            )}
          </div>
        </div>

        {/* Row 3: Sale price */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--biz-text)]">Sale Price</span>
            <button
              onClick={() => set("perPlatformPricing", !inputs.perPlatformPricing)}
              className="text-[11px] text-[var(--biz-primary)] hover:underline"
            >
              {inputs.perPlatformPricing ? "Use single price" : "Set per-platform prices"}
            </button>
          </div>

          {!inputs.perPlatformPricing ? (
            <DollarInput
              label="Sale Price (all platforms)"
              value={inputs.globalSalePrice}
              onChange={(v) => set("globalSalePrice", v)}
              placeholder="0.00"
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ALL_PLATFORMS.map((pid) => (
                <DollarInput
                  key={pid}
                  label={PLATFORM_NAMES[pid]}
                  value={inputs.platformPrices[pid]}
                  onChange={(v) => setPlatformPrice(pid, v)}
                  placeholder="0.00"
                />
              ))}
            </div>
          )}
        </div>

        {/* Row 4: Shipping */}
        <DollarInput
          label="Shipping Cost (what you pay)"
          value={inputs.shipping}
          onChange={(v) => set("shipping", v)}
          placeholder="0.00"
          hint="Applied to all platforms. COMC and Card Show (local) ignore this."
        />

        {/* ── Platform-specific settings ── */}
        <div
          style={{ borderTop: "1px solid var(--biz-border)" }}
          className="pt-4 space-y-4"
        >
          <p className="text-xs font-semibold text-[var(--biz-text)]">Platform Settings</p>

          {/* eBay TRP */}
          <Toggle
            label="eBay Top Rated Plus (12.35% rate)"
            checked={inputs.ebayTopRated}
            onChange={(v) => set("ebayTopRated", v)}
            hint="Your current eBay fee profile from settings"
          />

          {/* Whatnot shipping */}
          <Toggle
            label="Whatnot: use $4.99 flat shipping estimate"
            checked={inputs.whatnotFlatShipping}
            onChange={(v) => set("whatnotFlatShipping", v)}
            hint="Off = uses the shipping cost you entered above"
          />

          {/* Facebook shipped */}
          <Toggle
            label="Facebook Marketplace: shipped (5% fee)"
            checked={inputs.facebookShipped}
            onChange={(v) => set("facebookShipped", v)}
            hint="Off = local/cash pickup, no fees"
          />

          {/* Card Show */}
          <div>
            {!showCardShow ? (
              <button
                onClick={() => setShowCardShow(true)}
                className="text-xs text-[var(--biz-primary)] hover:underline"
              >
                + Add card show table cost
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <DollarInput
                  label="Monthly Table Cost"
                  value={inputs.cardShowTableCost}
                  onChange={(v) => set("cardShowTableCost", v)}
                  placeholder="0.00"
                />
                <DollarInput
                  label="Cards Sold Per Show"
                  value={inputs.cardShowCards}
                  onChange={(v) => set("cardShowCards", v)}
                  placeholder="0"
                  hint="Amortized cost = table ÷ cards"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      {hasAnyInput && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--biz-text)]">
              {inputs.cardName ? `Results — ${inputs.cardName}` : "Results"}
            </h3>
            <button
              onClick={() => setShowFormulas(!showFormulas)}
              className="text-[11px] text-[var(--biz-primary)] hover:underline flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {showFormulas ? "Hide formulas" : "How fees are calculated"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((result) => (
              <PlatformResultCard
                key={result.platformId}
                result={result}
                isWinner={result.platformId === winnerPid && result.grossSalePrice > 0}
                isLoss={result.profitDollars < 0 && result.grossSalePrice > 0}
                showFormula={showFormulas}
              />
            ))}
          </div>

          {winnerPid && (
            <p className="text-[11px] text-[var(--biz-muted)]">
              Highest net proceeds: <span className="font-semibold text-[var(--biz-primary)]">{PLATFORM_NAMES[winnerPid]}</span>
              {" "}· Net = gross sale price minus all platform fees and shipping
            </p>
          )}
        </div>
      )}

      {!hasAnyInput && (
        <div
          style={{ border: "1px dashed var(--biz-border)" }}
          className="rounded-xl p-8 text-center"
        >
          <p className="text-sm text-[var(--biz-muted)]">
            Enter a sale price to see results across all platforms.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Buy/Flip Mode ────────────────────────────────────────────────────────────

type GradingOutcome = "raw" | "psa9" | "psa10";

interface FlipInputs {
  cardName: string;
  askingPrice: string;
  offerPrice: string;
  estSalePrice: string;
  platform: PlatformId;
  shippingIn: string;
  gradingCost: string;
  gradingOutcome: GradingOutcome;
  // eBay
  ebayTopRated: boolean;
  // Whatnot shipping
  whatnotFlatShipping: boolean;
  // Facebook
  facebookShipped: boolean;
  // Card show
  cardShowTableCost: string;
  cardShowCards: string;
}

function defaultFlipInputs(ebayTopRated: boolean): FlipInputs {
  return {
    cardName: "",
    askingPrice: "",
    offerPrice: "",
    estSalePrice: "",
    platform: "ebay",
    shippingIn: "",
    gradingCost: "",
    gradingOutcome: "raw",
    ebayTopRated,
    whatnotFlatShipping: false,
    facebookShipped: false,
    cardShowTableCost: "",
    cardShowCards: "",
  };
}

function computeFlipResult(inputs: FlipInputs): {
  costBasis: number;
  result: PlatformResult;
  breakEven: number;
} {
  const buyPrice = clamp0(numInput(inputs.offerPrice)) || clamp0(numInput(inputs.askingPrice));
  const shippingIn = clamp0(numInput(inputs.shippingIn));
  const gradingCost = clamp0(numInput(inputs.gradingCost));
  const costBasis = round2(buyPrice + shippingIn + gradingCost);
  const estSalePrice = clamp0(numInput(inputs.estSalePrice));
  const pid = inputs.platform;

  const tableAmortized = (() => {
    const tc = clamp0(numInput(inputs.cardShowTableCost));
    const cards = clamp0(numInput(inputs.cardShowCards));
    if (tc > 0 && cards > 0) return round2(tc / cards);
    return 0;
  })();

  let result: PlatformResult;
  let breakEven: number;

  if (pid === "ebay") {
    result = calcEbay(estSalePrice, costBasis, 0, inputs.ebayTopRated);
    breakEven = calcEbayBreakEven(costBasis, 0, inputs.ebayTopRated);
  } else if (pid === "whatnot") {
    const shippingOut = inputs.whatnotFlatShipping ? 4.99 : 0;
    result = calcWhatnot(estSalePrice, costBasis, shippingOut);
    breakEven = calcWhatnotBreakEven(costBasis, shippingOut);
  } else if (pid === "comc") {
    result = calcCOMC(estSalePrice, costBasis);
    breakEven = calcCOMCBreakEven(costBasis);
  } else if (pid === "personal_website") {
    result = calcPersonalWebsite(estSalePrice, costBasis, 0);
    breakEven = calcPersonalWebsiteBreakEven(costBasis, 0);
  } else if (pid === "card_show") {
    result = calcCardShow(estSalePrice, costBasis, tableAmortized);
    breakEven = calcCardShowBreakEven(costBasis, tableAmortized);
  } else {
    result = calcFacebook(estSalePrice, costBasis, 0, inputs.facebookShipped);
    breakEven = calcFacebookBreakEven(costBasis, 0, inputs.facebookShipped);
  }

  return { costBasis, result, breakEven };
}

const GRADING_LABELS: Record<GradingOutcome, string> = {
  raw: "Raw (no grading)",
  psa9: "PSA 9",
  psa10: "PSA 10",
};

function FlipMode({ initialTopRated }: { initialTopRated: boolean }) {
  const [inputs, setInputs] = useState<FlipInputs>(() => defaultFlipInputs(initialTopRated));
  const [showGrading, setShowGrading] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  const set = <K extends keyof FlipInputs>(key: K, val: FlipInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: val }));

  const { costBasis, result, breakEven } = useMemo(
    () => computeFlipResult(inputs),
    [inputs]
  );

  const estSalePrice = clamp0(numInput(inputs.estSalePrice));
  const hasInput = estSalePrice > 0 || costBasis > 0;
  const profit = result.profitDollars;
  const verdict =
    Math.abs(profit) < 0.01
      ? "BREAK EVEN"
      : profit > 0
      ? "PROFITABLE"
      : "LOSS";

  const verdictColor =
    verdict === "PROFITABLE"
      ? "bg-[#f0fdf4] border-[var(--biz-primary)] text-[var(--biz-primary)]"
      : verdict === "LOSS"
      ? "bg-red-50 border-red-400 text-red-600"
      : "bg-amber-50 border-amber-300 text-[var(--biz-warning)]";

  const showPlatformSettings =
    inputs.platform === "ebay" ||
    inputs.platform === "whatnot" ||
    inputs.platform === "facebook" ||
    inputs.platform === "card_show";

  return (
    <div className="space-y-6">
      {/* ── Inputs panel ── */}
      <div
        style={{ border: "1px solid var(--biz-border)" }}
        className="rounded-xl bg-[var(--biz-surface)] p-5 space-y-5"
      >
        {/* Card name */}
        <TextInput
          label="Card Name"
          value={inputs.cardName}
          onChange={(v) => set("cardName", v)}
          placeholder="e.g. 2020 Topps Chrome Patrick Mahomes #1"
        />

        {/* Prices row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DollarInput
            label="Asking Price"
            value={inputs.askingPrice}
            onChange={(v) => set("askingPrice", v)}
            placeholder="0.00"
            hint="What the listing says"
          />
          <DollarInput
            label="Your Offer / Buy Price"
            value={inputs.offerPrice}
            onChange={(v) => set("offerPrice", v)}
            placeholder="0.00"
            hint="What you'd actually pay"
          />
          <DollarInput
            label="Est. Sale Price"
            value={inputs.estSalePrice}
            onChange={(v) => set("estSalePrice", v)}
            placeholder="0.00"
            hint={
              inputs.gradingOutcome === "psa10"
                ? "Expected PSA 10 sale price"
                : inputs.gradingOutcome === "psa9"
                ? "Expected PSA 9 sale price"
                : "Expected raw sale price"
            }
          />
        </div>

        {/* Platform + shipping in */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--biz-muted)] mb-1">
              Sell On Platform
            </label>
            <select
              value={inputs.platform}
              onChange={(e) => set("platform", e.target.value as PlatformId)}
              className="w-full rounded-lg border border-[color:var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2 text-sm text-[var(--biz-text)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
            >
              {ALL_PLATFORMS.map((pid) => (
                <option key={pid} value={pid}>
                  {PLATFORM_NAMES[pid]}
                </option>
              ))}
            </select>
          </div>
          <DollarInput
            label="Shipping to Receive Card"
            value={inputs.shippingIn}
            onChange={(v) => set("shippingIn", v)}
            placeholder="0.00"
            hint="Added to your cost basis"
          />
        </div>

        {/* Grading */}
        <div>
          {!showGrading ? (
            <button
              onClick={() => setShowGrading(true)}
              className="text-xs text-[var(--biz-primary)] hover:underline"
            >
              + Add grading cost
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DollarInput
                label="Grading Cost"
                value={inputs.gradingCost}
                onChange={(v) => set("gradingCost", v)}
                placeholder="0.00"
                hint="PSA, BGS, SGC submission cost"
              />
              <div>
                <label className="block text-xs font-medium text-[var(--biz-muted)] mb-1">
                  Grading Outcome Assumption
                </label>
                <div className="flex gap-2">
                  {(["raw", "psa9", "psa10"] as GradingOutcome[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => set("gradingOutcome", g)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        inputs.gradingOutcome === g
                          ? "border-[var(--biz-primary)] bg-[#f0fdf4] text-[var(--biz-primary)]"
                          : "border-[color:var(--biz-border)] text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
                      }`}
                    >
                      {GRADING_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Platform-specific settings */}
        {showPlatformSettings && (
          <div
            style={{ borderTop: "1px solid var(--biz-border)" }}
            className="pt-4 space-y-3"
          >
            <p className="text-xs font-semibold text-[var(--biz-text)]">Platform Settings</p>
            {inputs.platform === "ebay" && (
              <Toggle
                label="Top Rated Plus (12.35% rate)"
                checked={inputs.ebayTopRated}
                onChange={(v) => set("ebayTopRated", v)}
              />
            )}
            {inputs.platform === "whatnot" && (
              <Toggle
                label="Use $4.99 flat shipping estimate"
                checked={inputs.whatnotFlatShipping}
                onChange={(v) => set("whatnotFlatShipping", v)}
              />
            )}
            {inputs.platform === "facebook" && (
              <Toggle
                label="Shipped (5% fee)"
                checked={inputs.facebookShipped}
                onChange={(v) => set("facebookShipped", v)}
                hint="Off = local/cash pickup, no fees"
              />
            )}
            {inputs.platform === "card_show" && (
              <div className="grid grid-cols-2 gap-3">
                <DollarInput
                  label="Monthly Table Cost"
                  value={inputs.cardShowTableCost}
                  onChange={(v) => set("cardShowTableCost", v)}
                  placeholder="0.00"
                />
                <DollarInput
                  label="Cards Sold Per Show"
                  value={inputs.cardShowCards}
                  onChange={(v) => set("cardShowCards", v)}
                  placeholder="0"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {hasInput && (
        <div
          style={{ border: "1px solid var(--biz-border)" }}
          className="rounded-xl bg-[var(--biz-surface)] p-5 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--biz-text)]">
              {inputs.cardName ? `Analysis — ${inputs.cardName}` : "Flip Analysis"}
            </h3>
            <span className={`rounded-lg border px-3 py-1 text-xs font-bold ${verdictColor}`}>
              {verdict}
            </span>
          </div>

          {/* Numbers grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              style={{ border: "1px solid var(--biz-border)" }}
              className="rounded-lg bg-[#F9FAFB] px-3 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-normal text-[var(--biz-muted)] mb-1">
                Total Cost Basis
              </p>
              <p className="text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                {fmt$(costBasis)}
              </p>
              <p className="text-[10px] text-[var(--biz-muted)]">
                Buy + shipping in{showGrading && numInput(inputs.gradingCost) > 0 ? " + grading" : ""}
              </p>
            </div>
            <div
              style={{ border: "1px solid var(--biz-border)" }}
              className="rounded-lg bg-[#F9FAFB] px-3 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-normal text-[var(--biz-muted)] mb-1">
                Net Proceeds
              </p>
              <p className="text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                {fmt$(result.netProceeds)}
              </p>
              <p className="text-[10px] text-[var(--biz-muted)]">After fees &amp; shipping out</p>
            </div>
            <div
              style={{ border: "1px solid var(--biz-border)" }}
              className={`rounded-lg px-3 py-2.5 ${
                profit > 0
                  ? "bg-[#f0fdf4]"
                  : profit < 0
                  ? "bg-red-50"
                  : "bg-amber-50"
              }`}
            >
              <p className="text-[10px] uppercase tracking-normal text-[var(--biz-muted)] mb-1">
                Profit / Loss
              </p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  profit > 0
                    ? "text-[var(--biz-primary)]"
                    : profit < 0
                    ? "text-red-500"
                    : "text-[var(--biz-warning)]"
                }`}
              >
                {fmt$(profit)}
              </p>
              <p className="text-[10px] text-[var(--biz-muted)]">{pct(result.profitPercent)} ROI</p>
            </div>
            <div
              style={{ border: "1px solid var(--biz-border)" }}
              className="rounded-lg bg-[#F9FAFB] px-3 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-normal text-[var(--biz-muted)] mb-1">
                Break-Even Price
              </p>
              <p className="text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                {fmt$(breakEven)}
              </p>
              <p className="text-[10px] text-[var(--biz-muted)]">Min. sale to not lose money</p>
            </div>
          </div>

          {/* Fee breakdown */}
          <div style={{ borderTop: "1px solid var(--biz-border)" }} className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--biz-text)]">
              Fee Breakdown — {result.platformName}
            </p>
            {result.feeLines.map((line, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-[var(--biz-muted)]">
                  {line.label}
                  {line.note && <span className="ml-1 opacity-60">({line.note})</span>}
                </span>
                <span className="text-xs tabular-nums text-[var(--biz-text)]">
                  {line.amount === 0 ? "—" : fmt$(line.amount)}
                </span>
              </div>
            ))}
            {result.shippingCost > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--biz-muted)]">Shipping out</span>
                <span className="text-xs tabular-nums text-[var(--biz-text)]">{fmt$(result.shippingCost)}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-medium">
              <span className="text-xs text-[var(--biz-text)]">Total fees &amp; shipping</span>
              <span className="text-xs tabular-nums text-[var(--biz-text)]">{fmt$(result.totalCosts)}</span>
            </div>
          </div>

          {/* Formula disclosure */}
          <div style={{ borderTop: "1px solid var(--biz-border)" }} className="pt-3">
            <button
              onClick={() => setShowFormula(!showFormula)}
              className="text-[11px] text-[var(--biz-primary)] hover:underline flex items-center gap-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showFormula ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              How fees are calculated
            </button>
            {showFormula && result.formulaDescription && (
              <p className="mt-2 text-[10px] text-[var(--biz-muted)] font-mono whitespace-pre-wrap leading-relaxed">
                {result.formulaDescription}
              </p>
            )}
          </div>
        </div>
      )}

      {!hasInput && (
        <div
          style={{ border: "1px dashed var(--biz-border)" }}
          className="rounded-xl p-8 text-center"
        >
          <p className="text-sm text-[var(--biz-muted)]">
            Enter your buy price and estimated sale price to analyze the flip.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main DealCalculator ───────────────────────────────────────────────────────

type CalcMode = "sell" | "flip";

export default function DealCalculator() {
  const [mode, setMode] = useState<CalcMode>("sell");
  const [ebayTopRated, setEbayTopRated] = useState(false);

  useEffect(() => {
    setEbayTopRated(readEbayProfile());
  }, []);

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div
        style={{ border: "1px solid var(--biz-border)" }}
        className="inline-flex rounded-lg bg-[var(--biz-surface)] p-1 gap-1"
      >
        {([["sell", "Sell Calculator"], ["flip", "Buy / Flip Calculator"]] as const).map(
          ([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === m
                  ? "bg-[var(--biz-primary)] text-white"
                  : "text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
              }`}
            >
              {label}
            </button>
          )
        )}
      </div>

      {mode === "sell" ? (
        <SellMode key="sell" initialTopRated={ebayTopRated} />
      ) : (
        <FlipMode key="flip" initialTopRated={ebayTopRated} />
      )}
    </div>
  );
}
