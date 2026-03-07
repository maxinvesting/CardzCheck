"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  calcEbay,
  calcWhatnot,
  calcCOMC,
  calcPersonalWebsite,
  calcCardShow,
  calcFacebook,
  fmt$,
  PLATFORM_NAMES,
  type PlatformId,
} from "@/lib/business/platform-fee-calculator";

const EBAY_FEE_STORAGE_KEY = "cardzcheck_ebay_fee_profile";

function readEbayTopRated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(EBAY_FEE_STORAGE_KEY) === "top_rated_plus";
  } catch {
    return false;
  }
}

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ebay", label: "eBay" },
  { id: "whatnot", label: "Whatnot" },
  { id: "comc", label: "COMC" },
  { id: "personal_website", label: "Personal Website" },
  { id: "card_show", label: "Card Show" },
  { id: "facebook", label: "Facebook (Local)" },
];

function calcQuick(
  costBasis: number,
  salePrice: number,
  platform: PlatformId,
  ebayTopRated: boolean
) {
  if (salePrice <= 0) return null;
  switch (platform) {
    case "ebay":
      return calcEbay(salePrice, costBasis, 0, ebayTopRated);
    case "whatnot":
      return calcWhatnot(salePrice, costBasis, 4.99);
    case "comc":
      return calcCOMC(salePrice, costBasis);
    case "personal_website":
      return calcPersonalWebsite(salePrice, costBasis, 0);
    case "card_show":
      return calcCardShow(salePrice, costBasis, 0);
    case "facebook":
      return calcFacebook(salePrice, costBasis, 0, false);
  }
}

function num(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.max(0, n);
}

function DollarInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-[var(--biz-muted)] mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--biz-muted)] text-xs">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-lg border border-[color:var(--biz-border)] bg-[var(--biz-surface)] pl-6 pr-3 py-2 text-sm text-[var(--biz-text)] placeholder:text-[var(--biz-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)] focus:border-[var(--biz-primary)]"
        />
      </div>
    </div>
  );
}

export default function QuickDealCheck() {
  const [costBasis, setCostBasis] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [platform, setPlatform] = useState<PlatformId>("ebay");
  const [ebayTopRated, setEbayTopRated] = useState(false);

  useEffect(() => {
    setEbayTopRated(readEbayTopRated());
  }, []);

  const result = useMemo(
    () => calcQuick(num(costBasis), num(salePrice), platform, ebayTopRated),
    [costBasis, salePrice, platform, ebayTopRated]
  );

  const profit = result?.profitDollars ?? null;
  const profitPct =
    result?.profitPercent !== null && result?.profitPercent !== undefined
      ? result.profitPercent
      : null;

  const hasResult = result !== null && num(salePrice) > 0;

  return (
    <div
      style={{ border: "1px solid var(--biz-border)" }}
      className="rounded-xl bg-[var(--biz-surface)] p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
            Quick Deal Check
          </h3>
          <p className="text-[11px] text-[var(--biz-muted)] mt-0.5">
            Instant profit estimate after platform fees
          </p>
        </div>
        <Link
          href="/business/calculator"
          className="shrink-0 text-[11px] text-[var(--biz-primary)] hover:underline whitespace-nowrap"
        >
          Open full calculator →
        </Link>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <DollarInput label="Cost Basis" value={costBasis} onChange={setCostBasis} />
        <DollarInput label="Sale Price" value={salePrice} onChange={setSalePrice} />
        <div>
          <label className="block text-[10px] font-medium text-[var(--biz-muted)] mb-1">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PlatformId)}
            className="w-full rounded-lg border border-[color:var(--biz-border)] bg-[var(--biz-surface)] px-2 py-2 text-xs text-[var(--biz-text)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Output */}
      {hasResult && profit !== null ? (
        <div
          style={{ borderTop: "1px solid var(--biz-border)" }}
          className="pt-4 flex items-center gap-4 flex-wrap"
        >
          <div>
            <p className="text-[10px] text-[var(--biz-muted)] uppercase tracking-normal">Net Proceeds</p>
            <p className="text-lg font-semibold tabular-nums text-[var(--biz-text)]">
              {fmt$(result!.netProceeds)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--biz-muted)] uppercase tracking-normal">Profit / Loss</p>
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
          </div>
          {profitPct !== null && (
            <div>
              <p className="text-[10px] text-[var(--biz-muted)] uppercase tracking-normal">Return</p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  profitPct > 0
                    ? "text-[var(--biz-primary)]"
                    : profitPct < 0
                    ? "text-red-500"
                    : "text-[var(--biz-warning)]"
                }`}
              >
                {profitPct >= 0 ? "+" : ""}
                {profitPct.toFixed(1)}%
              </p>
            </div>
          )}
          <span
            className={`ml-auto rounded-full px-3 py-1 text-xs font-bold border ${
              profit > 0.01
                ? "bg-[#f0fdf4] border-[var(--biz-primary)] text-[var(--biz-primary)]"
                : profit < -0.01
                ? "bg-red-50 border-red-400 text-red-600"
                : "bg-amber-50 border-amber-300 text-[var(--biz-warning)]"
            }`}
          >
            {profit > 0.01 ? "PROFITABLE" : profit < -0.01 ? "LOSS" : "BREAK EVEN"}
          </span>
        </div>
      ) : (
        <div
          style={{ borderTop: "1px solid var(--biz-border)" }}
          className="pt-4"
        >
          <p className="text-[11px] text-[var(--biz-muted)]">
            Enter cost basis and sale price to see instant profit estimate.
            {platform === "whatnot" && " Includes $4.99 shipping estimate."}
            {platform === "comc" && " Includes $1.00 submission fee."}
            {" "}
            <Link href="/business/calculator" className="text-[var(--biz-primary)] hover:underline">
              Full calculator
            </Link>{" "}
            for itemized breakdowns and per-platform comparison.
          </p>
        </div>
      )}
    </div>
  );
}
