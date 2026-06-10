"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasBusinessWorkspaceAccess } from "@/lib/business/workspace-access";
import {
  ANNUAL_SAVINGS,
  BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE,
  BUSINESS_INCLUDED_SEATS,
  BUSINESS_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  PRO_MONTHLY_PRICE,
  formatPrice,
} from "@/lib/pricing";
import { LIMITS } from "@/types";

/* ── Small atoms ─────────────────────────────────────────────── */

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="desk-eyebrow">{children}</p>;
}

function GoldRule() {
  return (
    <span
      className="block h-px w-10"
      style={{ background: "linear-gradient(90deg, var(--desk-gold), transparent)" }}
    />
  );
}

/* ── Hero intelligence panel — a concrete look at the product ──── */

function IntelligencePanel() {
  const grades = [
    { label: "PSA 10", pct: 41, tone: "var(--desk-gold-bright)" },
    { label: "PSA 9", pct: 38, tone: "rgba(255,255,255,0.55)" },
    { label: "PSA 8", pct: 15, tone: "rgba(255,255,255,0.28)" },
  ];

  return (
    <div
      className="desk-panel lp-sheen lp-rise relative overflow-hidden p-5 sm:p-6"
      style={{ animationDelay: "0.35s" }}
    >
      {/* header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="desk-pulse" />
            <span className="desk-eyebrow" style={{ letterSpacing: "0.18em" }}>
              Live analysis
            </span>
          </div>
          <p className="mt-2 text-[15px] font-semibold text-[color:var(--biz-text)]">
            2018 Prizm · Luka Dončić
          </p>
          <p className="lp-mono mt-0.5 text-[11px] text-[color:var(--biz-faint)]">
            #280 · Base · Raw
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: "var(--desk-gold-bright)",
            border: "1px solid rgba(194,168,106,0.4)",
            background: "rgba(194,168,106,0.08)",
          }}
        >
          Grade ready
        </span>
      </div>

      <div className="desk-rule my-5" />

      {/* grade probabilities */}
      <Eyebrow>Grade probability</Eyebrow>
      <div className="mt-3 space-y-2.5">
        {grades.map((g, i) => (
          <div key={g.label} className="flex items-center gap-3">
            <span className="lp-mono w-12 shrink-0 text-[11px] text-[color:var(--biz-muted)]">
              {g.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="lp-bar-fill h-full rounded-full"
                style={{
                  width: `${g.pct}%`,
                  background: g.tone,
                  animationDelay: `${0.6 + i * 0.12}s`,
                }}
              />
            </div>
            <span className="lp-mono w-9 shrink-0 text-right text-[12px] font-medium text-[color:var(--biz-text)]">
              {g.pct}%
            </span>
          </div>
        ))}
      </div>

      <div className="desk-rule my-5" />

      {/* value + comps */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Est. market value · PSA 10</Eyebrow>
          <p
            className="desk-figure mt-1 text-3xl text-[color:var(--biz-text-strong)]"
            style={{ fontWeight: 420 }}
          >
            $1,240
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--biz-profit)" }}>
            ▲ 6.4% · 30-day comps
          </p>
        </div>
        {/* sparkline */}
        <svg
          width="120"
          height="48"
          viewBox="0 0 120 48"
          fill="none"
          className="shrink-0"
          aria-hidden
        >
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(155,172,163,0.22)" />
              <stop offset="100%" stopColor="rgba(155,172,163,0)" />
            </linearGradient>
          </defs>
          <path
            d="M2 38 L18 34 L34 36 L50 28 L66 30 L82 20 L98 22 L118 10 L118 48 L2 48 Z"
            fill="url(#sparkFill)"
          />
          <path
            className="lp-spark"
            d="M2 38 L18 34 L34 36 L50 28 L66 30 L82 20 L98 22 L118 10"
            stroke="var(--biz-profit)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeDasharray: 360, strokeDashoffset: 360 }}
          />
        </svg>
      </div>

      {/* deal chip */}
      <div
        className="mt-5 flex items-center justify-between rounded-xl px-4 py-3"
        style={{
          border: "1px solid rgba(194,168,106,0.22)",
          background: "linear-gradient(180deg, rgba(194,168,106,0.08), transparent)",
        }}
      >
        <div>
          <p className="text-[12px] font-medium text-[color:var(--biz-text)]">
            On the CardzCheck desk
          </p>
          <p className="lp-mono mt-0.5 text-[11px] text-[color:var(--biz-faint)]">
            13.5% below our eBay storefront
          </p>
        </div>
        <span
          className="lp-mono text-lg font-semibold"
          style={{ color: "var(--desk-gold-bright)" }}
        >
          $1,072
        </span>
      </div>
    </div>
  );
}

/* ── Capability card ─────────────────────────────────────────── */

function Capability({
  index,
  eyebrow,
  title,
  description,
  points,
  featured,
  icon,
}: {
  index: number;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  featured?: boolean;
  icon: ReactNode;
}) {
  return (
    <article
      className={`lp-rise lp-hover-lift flex h-full flex-col p-6 ${
        featured ? "desk-panel desk-panel--feature" : "desk-panel"
      }`}
      style={{ animationDelay: `${0.1 + index * 0.08}s` }}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{
            color: featured ? "var(--desk-gold-bright)" : "var(--biz-muted-strong)",
            border: featured
              ? "1px solid rgba(194,168,106,0.32)"
              : "1px solid var(--biz-border)",
            background: featured ? "rgba(194,168,106,0.08)" : "rgba(255,255,255,0.02)",
          }}
        >
          {icon}
        </span>
        {featured ? (
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              color: "var(--desk-gold-bright)",
              border: "1px solid rgba(194,168,106,0.35)",
            }}
          >
            Flagship engine
          </span>
        ) : null}
      </div>

      <p className="desk-eyebrow mt-5">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold leading-snug text-[color:var(--biz-text-strong)]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--biz-muted)]">
        {description}
      </p>

      <ul className="mt-4 space-y-2 text-sm text-[color:var(--biz-muted-strong)]">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5">
            <span
              className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
              style={{ background: featured ? "var(--desk-gold)" : "var(--biz-faint)" }}
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const hasBusinessAccess = await hasBusinessWorkspaceAccess(
          supabase as any,
          user.id
        );
        router.replace(hasBusinessAccess ? "/business" : "/dashboard");
      } else {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-white/25" />
      </div>
    );
  }

  const tickerItems = [
    "Grade Probability Engine",
    "PSA · BGS · SGC modeling",
    "Live comps & market value",
    "Card-photo identification",
    "Inventory & P&L ledger",
    "eBay · Whatnot channels",
    "Analyst AI",
    "Subscriber deals 13.5% below eBay",
    "Bulk lot processing",
  ];

  return (
    <div className="business-theme desk relative min-h-screen overflow-x-hidden bg-[color:var(--biz-bg)]">
      {/* atmospheric texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(110% 80% at 78% -10%, rgba(194,168,106,0.07), transparent 55%), radial-gradient(90% 70% at 8% 0%, rgba(255,255,255,0.03), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 9px, rgba(255,255,255,0.5) 9px, rgba(255,255,255,0.5) 10px)",
        }}
      />

      <div className="relative z-10">
        {/* ── Nav ─────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-[color:var(--biz-border-subtle)] bg-[color:var(--biz-near-black)]/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-bold"
                style={{
                  color: "var(--biz-primary-foreground)",
                  background:
                    "linear-gradient(180deg, var(--desk-gold-bright), var(--desk-gold))",
                }}
              >
                C
              </span>
              <span className="text-lg font-bold tracking-tight text-[color:var(--biz-text-strong)]">
                CardzCheck
              </span>
            </Link>

            <nav className="hidden items-center gap-7 text-[13px] text-[color:var(--biz-muted)] md:flex">
              <a href="#capabilities" className="transition-colors hover:text-[color:var(--biz-text)]">
                Platform
              </a>
              <a href="#deals" className="transition-colors hover:text-[color:var(--biz-text)]">
                Deals
              </a>
              <a href="#pricing" className="transition-colors hover:text-[color:var(--biz-text)]">
                Pricing
              </a>
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="hidden px-3 py-2 text-[13px] text-[color:var(--biz-muted)] transition-colors hover:text-[color:var(--biz-text)] sm:block"
              >
                Login
              </Link>
              <Link href="/signup" className="desk-btn desk-btn-gold !px-4 !py-2 !text-[13px]">
                Start free
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5">
          {/* ── Hero ──────────────────────────────────────── */}
          <section className="grid items-center gap-12 pb-14 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
            <div>
              <div className="lp-rise flex items-center gap-3" style={{ animationDelay: "0s" }}>
                <GoldRule />
                <Eyebrow>For collectors · flippers · dealers</Eyebrow>
              </div>

              <h1
                className="desk-display lp-rise mt-6 text-[2.65rem] leading-[1.04] text-[color:var(--biz-text-strong)] sm:text-6xl"
                style={{ animationDelay: "0.08s" }}
              >
                The intelligence desk
                <br />
                for sports cards.
              </h1>

              <p
                className="lp-rise mt-6 max-w-xl text-[1.05rem] leading-relaxed text-[color:var(--biz-muted)]"
                style={{ animationDelay: "0.16s" }}
              >
                Grade probability, live market value, and full business operations — one
                operator-grade workspace that tells you what a card is worth, whether to grade
                it, and how to move it.
              </p>

              <div
                className="lp-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
                style={{ animationDelay: "0.24s" }}
              >
                <Link
                  href="/signup"
                  className="desk-btn desk-btn-gold !rounded-xl !px-6 !py-3.5 !text-sm"
                >
                  Start free — no card required
                </Link>
                <a href="#capabilities" className="desk-btn !rounded-xl !px-6 !py-3.5 !text-sm">
                  See how it works
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </a>
              </div>

              <dl
                className="lp-rise mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[color:var(--biz-border)]"
                style={{ animationDelay: "0.3s", background: "var(--biz-border)" }}
              >
                {[
                  { k: "Free to start", v: `${LIMITS.FREE_SEARCHES} searches · ${LIMITS.FREE_COLLECTION} cards` },
                  { k: "Grade before you pay", v: "PSA · BGS · SGC odds" },
                  { k: "Buy on the desk", v: "13.5% below our eBay" },
                ].map((s) => (
                  <div key={s.k} className="bg-[color:var(--biz-surface)] px-4 py-4">
                    <dt className="desk-eyebrow">{s.k}</dt>
                    <dd className="mt-1.5 text-[13px] font-medium text-[color:var(--biz-text)]">
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <IntelligencePanel />
          </section>

          {/* ── Ticker ────────────────────────────────────── */}
          <div className="relative overflow-hidden border-y border-[color:var(--biz-border-subtle)] py-3">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24"
              style={{ background: "linear-gradient(90deg, var(--biz-bg), transparent)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24"
              style={{ background: "linear-gradient(270deg, var(--biz-bg), transparent)" }}
            />
            <div className="lp-ticker-track">
              {[...tickerItems, ...tickerItems].map((item, i) => (
                <span
                  key={i}
                  className="lp-mono mx-6 inline-flex items-center gap-3 text-[11px] uppercase tracking-wider text-[color:var(--biz-faint)]"
                >
                  <span
                    className="h-1 w-1 rounded-full"
                    style={{ background: "var(--desk-gold)" }}
                  />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* ── Two modes ─────────────────────────────────── */}
          <section className="py-20">
            <div className="lp-rise mb-10 flex items-center gap-3">
              <GoldRule />
              <Eyebrow>One platform · two seats</Eyebrow>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <article
                className="desk-panel lp-rise lp-hover-lift relative overflow-hidden p-7 sm:p-9"
                style={{ animationDelay: "0.05s" }}
              >
                <p className="desk-eyebrow">Collector mode</p>
                <h2 className="desk-display mt-3 text-2xl text-[color:var(--biz-text-strong)] sm:text-[1.75rem]">
                  Know what your cards are doing.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-[color:var(--biz-muted)]">
                  Track cost basis, current value, and movement over time. Lean into what is
                  performing, cut what is stalling, and decide what to grade — all from one shelf.
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-[color:var(--biz-muted-strong)]">
                  {["Collection value & cost-basis tracking", "Grade probability before you submit", "Saved searches & live comps"].map(
                    (p) => (
                      <li key={p} className="flex items-center gap-2.5">
                        <span className="h-1 w-1 rounded-full bg-[color:var(--biz-faint)]" />
                        {p}
                      </li>
                    )
                  )}
                </ul>
              </article>

              <article
                className="desk-panel desk-panel--feature lp-rise lp-hover-lift relative overflow-hidden p-7 sm:p-9"
                style={{ animationDelay: "0.13s" }}
              >
                <p className="desk-eyebrow">Business mode</p>
                <h2 className="desk-display mt-3 text-2xl text-[color:var(--biz-text-strong)] sm:text-[1.75rem]">
                  Run inventory like a real desk.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-[color:var(--biz-muted)]">
                  Inventory, P&L, and sales across eBay and Whatnot in one workspace — with seat
                  roles for owners, managers, and staff, and an Analyst AI reading the books.
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-[color:var(--biz-muted-strong)]">
                  {["Inventory, ledger & sales tracking", "Owner / manager / employee seats", "Analyst & Business Consultant workflows"].map(
                    (p) => (
                      <li key={p} className="flex items-center gap-2.5">
                        <span
                          className="h-1 w-1 rounded-full"
                          style={{ background: "var(--desk-gold)" }}
                        />
                        {p}
                      </li>
                    )
                  )}
                </ul>
              </article>
            </div>
          </section>

          {/* ── Capabilities ──────────────────────────────── */}
          <section id="capabilities" className="scroll-mt-24 py-8">
            <div className="lp-rise mb-3 flex items-center gap-3">
              <GoldRule />
              <Eyebrow>The toolkit</Eyebrow>
            </div>
            <h2 className="desk-display lp-rise mb-10 max-w-2xl text-3xl text-[color:var(--biz-text-strong)] sm:text-4xl">
              Every decision in the card game, backed by data.
            </h2>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Capability
                index={0}
                featured
                eyebrow="Grade Probability Engine"
                title="Know the grade before you submit"
                description="Upload photos and get PSA, BGS, and SGC grade odds with confidence levels — before you ever pay for a submission."
                points={["Confidence-scored grade odds", "Pre-submit expected-value modeling", "Submission ROI calculator"]}
                icon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.8 4.7a3.4 3.4 0 001.95-.8 3.4 3.4 0 014.44 0 3.4 3.4 0 001.95.8 3.4 3.4 0 013.14 3.14 3.4 3.4 0 00.8 1.95 3.4 3.4 0 010 4.44 3.4 3.4 0 00-.8 1.95 3.4 3.4 0 01-3.14 3.14 3.4 3.4 0 00-1.95.8 3.4 3.4 0 01-4.44 0 3.4 3.4 0 00-1.95-.8 3.4 3.4 0 01-3.14-3.14 3.4 3.4 0 00-.8-1.95 3.4 3.4 0 010-4.44 3.4 3.4 0 00.8-1.95A3.4 3.4 0 017.8 4.7z" />
                  </svg>
                }
              />
              <Capability
                index={1}
                eyebrow="Pricing Insights"
                title="Price with confidence"
                description="Live sold comps and estimated value ranges so you know the number before you buy, list, or flip."
                points={["Market value & trend tracking", "Card-photo identification", "Saved searches & quick repeats"]}
                icon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5" />
                  </svg>
                }
              />
              <Capability
                index={2}
                eyebrow="Operations"
                title="Operate at scale"
                description="Manage inventory, track P&L, and sell across eBay and Whatnot from a single business dashboard."
                points={["Inventory, ledger & sales", "Seat roles for your team", "eBay & Whatnot integration"]}
                icon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5h16M4 12h16M4 19h16M8 5v14" />
                  </svg>
                }
              />
              <Capability
                index={3}
                eyebrow="CardzCheck Deals"
                title="Shop below our eBay price"
                description="Paid subscribers get our curated storefront, priced at least 13.5% below our own eBay listings."
                points={["Always 13.5%+ below our eBay", "Loyalty discounts up to 10%", "Extra 1% off for Business members"]}
                icon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 7H4l1-7z" />
                  </svg>
                }
              />
            </div>
          </section>

          {/* ── Deals spotlight ───────────────────────────── */}
          <section id="deals" className="scroll-mt-24 py-20">
            <div
              className="desk-panel desk-panel--feature lp-rise overflow-hidden p-7 sm:p-10"
            >
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div>
                  <div className="flex items-center gap-3">
                    <GoldRule />
                    <Eyebrow>Subscriber exclusive</Eyebrow>
                  </div>
                  <h2 className="desk-display mt-4 text-3xl text-[color:var(--biz-text-strong)] sm:text-4xl">
                    CardzCheck Deals
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-[color:var(--biz-muted)]">
                    Every paid subscriber gets the curated storefront — CardzCheck inventory priced
                    at least{" "}
                    <span className="font-semibold text-[color:var(--biz-text)]">
                      13.5% below our eBay storefront
                    </span>
                    , some below market comps. Not a peer-to-peer marketplace. Sold directly by
                    CardzCheck.
                  </p>
                  <ul className="mt-6 space-y-2.5 text-sm text-[color:var(--biz-muted-strong)]">
                    {[
                      "Subscriber-only pricing on every listing",
                      "Loyalty discounts unlock at 5 and 10 purchases (up to 10% off)",
                      "Business members get an extra 1% off every deal",
                      "Every 5th purchase earns a milestone discount",
                    ].map((p) => (
                      <li key={p} className="flex items-start gap-2.5">
                        <span
                          className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                          style={{ background: "var(--desk-gold)" }}
                        />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/marketplace"
                    className="desk-btn desk-btn-gold mt-7 !rounded-xl !px-5 !py-3 !text-sm"
                  >
                    Browse the marketplace
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>

                {/* pricing comparison */}
                <div className="desk-panel rounded-2xl p-6">
                  <p className="desk-eyebrow">Pricing vs. our eBay</p>
                  <div className="mt-5 space-y-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-[color:var(--biz-faint)] line-through">
                        Our eBay storefront
                      </span>
                      <span className="lp-mono text-sm text-[color:var(--biz-faint)] line-through">
                        $179
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-[color:var(--biz-text)]">Subscriber price</span>
                      <span className="lp-mono text-2xl font-semibold text-[color:var(--biz-text-strong)]">
                        $155
                      </span>
                    </div>
                    <div className="desk-rule" />
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm" style={{ color: "var(--biz-profit)" }}>
                        You save
                      </span>
                      <span
                        className="lp-mono text-lg font-semibold"
                        style={{ color: "var(--biz-profit)" }}
                      >
                        $24 · 13.5%
                      </span>
                    </div>
                  </div>
                  <p className="mt-5 text-[11px] leading-relaxed text-[color:var(--biz-faint)]">
                    Example based on a $179 eBay listing. Business members save an additional 1%.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Pricing ───────────────────────────────────── */}
          <section id="pricing" className="scroll-mt-24 pb-24">
            <div className="lp-rise mb-3 flex items-center gap-3">
              <GoldRule />
              <Eyebrow>Plans that scale with you</Eyebrow>
            </div>
            <h2 className="desk-display lp-rise mb-10 text-3xl text-[color:var(--biz-text-strong)] sm:text-4xl">
              Start free. Upgrade when the desk grows.
            </h2>

            <div className="grid gap-5 md:grid-cols-3">
              {/* Free */}
              <article className="desk-panel lp-rise flex flex-col p-7" style={{ animationDelay: "0.05s" }}>
                <p className="desk-eyebrow">Free</p>
                <p className="desk-figure mt-4 text-4xl text-[color:var(--biz-text-strong)]">$0</p>
                <p className="mt-1 text-sm text-[color:var(--biz-faint)]">forever</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-[color:var(--biz-muted-strong)]">
                  {[`${LIMITS.FREE_SEARCHES} card searches`, `${LIMITS.FREE_COLLECTION} collection cards`, "Grade estimator access", "Dashboard basics"].map((p) => (
                    <li key={p} className="flex items-center gap-2.5">
                      <span className="h-1 w-1 rounded-full bg-[color:var(--biz-faint)]" />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="desk-btn mt-7 w-full justify-center !rounded-xl !py-3 !text-sm">
                  Create free account
                </Link>
              </article>

              {/* Pro */}
              <article
                className="desk-panel desk-panel--feature lp-rise relative flex flex-col p-7"
                style={{ animationDelay: "0.12s" }}
              >
                <span
                  className="absolute -top-3 left-7 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: "var(--biz-primary-foreground)",
                    background: "linear-gradient(180deg, var(--desk-gold-bright), var(--desk-gold))",
                  }}
                >
                  Most popular
                </span>
                <p className="desk-eyebrow">Pro</p>
                <p className="desk-figure mt-4 text-4xl text-[color:var(--biz-text-strong)]">
                  {formatPrice(PRO_MONTHLY_PRICE)}
                  <span className="text-base text-[color:var(--biz-faint)]">/mo</span>
                </p>
                <p className="mt-1 text-sm text-[color:var(--biz-faint)]">
                  or {formatPrice(PRO_ANNUAL_PRICE)}/yr · save {formatPrice(ANNUAL_SAVINGS)}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-[color:var(--biz-muted-strong)]">
                  {["Unlimited card searches", "Full collection tracking", "Analyst AI + Grade Probability Engine", "Subscriber deals (13.5%+ below our eBay)"].map((p) => (
                    <li key={p} className="flex items-start gap-2.5">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--desk-gold)" }} />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="desk-btn desk-btn-gold mt-7 w-full justify-center !rounded-xl !py-3 !text-sm">
                  Start Pro
                </Link>
              </article>

              {/* Business */}
              <article className="desk-panel lp-rise flex flex-col p-7" style={{ animationDelay: "0.19s" }}>
                <p className="desk-eyebrow">Business · for card teams</p>
                <p className="desk-figure mt-4 text-4xl text-[color:var(--biz-text-strong)]">
                  {formatPrice(BUSINESS_MONTHLY_PRICE)}
                  <span className="text-base text-[color:var(--biz-faint)]">/mo</span>
                </p>
                <p className="mt-1 text-sm text-[color:var(--biz-faint)]">
                  {BUSINESS_INCLUDED_SEATS} seat included · +{formatPrice(BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE)}/mo per seat
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-[color:var(--biz-muted-strong)]">
                  {["Everything in Pro", "Shared inventory, sales & ledger", "Role-based team access & seats", "Profit-focused business dashboard"].map((p) => (
                    <li key={p} className="flex items-center gap-2.5">
                      <span className="h-1 w-1 rounded-full bg-[color:var(--biz-faint)]" />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="desk-btn mt-7 w-full justify-center !rounded-xl !py-3 !text-sm">
                  Start Business
                </Link>
              </article>
            </div>
          </section>

          {/* ── Closing CTA ───────────────────────────────── */}
          <section className="pb-24">
            <div
              className="desk-panel lp-rise relative overflow-hidden px-7 py-12 text-center sm:px-10 sm:py-16"
              style={{
                background:
                  "radial-gradient(120% 140% at 50% -20%, rgba(194,168,106,0.1), transparent 60%), var(--biz-surface)",
              }}
            >
              <Eyebrow>Open the books</Eyebrow>
              <h2 className="desk-display mx-auto mt-4 max-w-2xl text-3xl text-[color:var(--biz-text-strong)] sm:text-[2.5rem] sm:leading-[1.08]">
                Stop guessing what your cards are worth.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-[color:var(--biz-muted)]">
                Start free in under a minute — {LIMITS.FREE_SEARCHES} searches, {LIMITS.FREE_COLLECTION} saved
                cards, and the grade estimator, on the house.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="desk-btn desk-btn-gold !rounded-xl !px-7 !py-3.5 !text-sm">
                  Start free
                </Link>
                <Link href="/login" className="desk-btn !rounded-xl !px-7 !py-3.5 !text-sm">
                  I already have an account
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* ── Footer ──────────────────────────────────────── */}
        <footer className="border-t border-[color:var(--biz-border-subtle)] bg-[color:var(--biz-near-black)]">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <span className="text-lg font-bold tracking-tight text-[color:var(--biz-text-strong)]">
                CardzCheck
              </span>
              <p className="mt-1 text-[13px] text-[color:var(--biz-faint)]">
                The intelligence desk for sports card collectors and businesses.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-[13px] text-[color:var(--biz-muted)]">
              <Link href="/marketplace" className="transition-colors hover:text-[color:var(--biz-text)]">
                Marketplace
              </Link>
              <Link href="/terms" className="transition-colors hover:text-[color:var(--biz-text)]">
                Terms
              </Link>
              <Link href="/privacy" className="transition-colors hover:text-[color:var(--biz-text)]">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
