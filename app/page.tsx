"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasBusinessWorkspaceAccess } from "@/lib/business/workspace-access";
import { createClient } from "@/lib/supabase/client";
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

type Feature = {
  title: string;
  description: string;
  points: string[];
  icon: ReactNode;
};

type Plan = {
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  emphasized?: boolean;
  note?: string;
};

const inventoryRows = [
  {
    item: "2023 Prizm Victor Wembanyama #136",
    status: "Listed",
    days: "3d",
    price: "$148",
  },
  {
    item: "2020 Topps Chrome Formula 1 lot",
    status: "Listed",
    days: "6d",
    price: "$92",
  },
  {
    item: "Pokemon 151 sealed bundle",
    status: "Draft",
    days: "—",
    price: "$64",
  },
  {
    item: "2019 Optic Ja Morant PSA 9",
    status: "Sold",
    days: "Paid out",
    price: "$118",
  },
];

const activityRows = [
  { label: "New listings", detail: "6 cards listed from collection", time: "9:14 AM" },
  { label: "Order paid", detail: "$118 sale, label printed, $41 profit", time: "8:52 AM" },
  { label: "Team update", detail: "AR moved 6 items to draft", time: "Yesterday" },
];

const features: Feature[] = [
  {
    title: "Manage your whole collection",
    description:
      "Keep every card in one place — cost basis, current value, condition, grade, photos, location, and quantity. From a single slab to thousands of cards.",
    points: ["Add cards one by one or import in bulk", "Cost basis and current value tracking", "Photos, grades, conditions, and locations"],
    icon: <IconPath d="M4 6h16M4 12h16M4 18h10M8 6v12" />,
  },
  {
    title: "Sell it on the platform",
    description:
      "List a card straight from your collection to the CardzCheck Marketplace, then take secure payments and print shipping labels without ever leaving the platform.",
    points: ["List in one click from your collection", "Secure checkout and built-in payouts", "Shipping labels and order tracking"],
    icon: <IconPath d="M6 7h12l1 13H5L6 7ZM9 7a3 3 0 0 1 6 0M9 13h6" />,
  },
  {
    title: "Run the financials like a company",
    description:
      "Every sale tracks revenue, fees, shipping, taxes, cost of goods, and payout, rolled into P&L and cash flow so you always know what the business made.",
    points: ["Revenue, fees, payout, and profit", "P&L and cash-flow reporting", "Accounting-ready exports"],
    icon: <IconPath d="M5 4h14v16H5V4Zm4 4h6M9 12h6M9 16h3" />,
  },
  {
    title: "Scale with a team",
    description:
      "Grow past a one-person operation. Add owners, managers, and employees to a shared workspace with roles and seats so the books stay in one place.",
    points: ["Owner, manager, and employee roles", "Team seats and invites", "Shared business dashboard"],
    icon: <IconPath d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 20a4 4 0 0 1 8 0M12 20a4 4 0 0 1 8 0" />,
  },
];

const workflow = [
  {
    label: "01",
    title: "Add or import inventory",
    body: "Capture the item, cost basis, quantity, condition, images, location, and owner before it gets lost in a spreadsheet.",
  },
  {
    label: "02",
    title: "Prepare the sale",
    body: "List from your collection to the marketplace, set the price, write the listing, and keep drafts separate from active inventory.",
  },
  {
    label: "03",
    title: "Record the order",
    body: "Track sale price, fees, shipping, tax, order ID, buyer notes, and resulting inventory status.",
  },
  {
    label: "04",
    title: "Reconcile the business",
    body: "Review revenue, active inventory, payouts, profit, aging inventory, and team activity from the business workspace.",
  },
];

const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    description: "A starter workspace for trying the product.",
    features: [
      `${LIMITS.FREE_COLLECTION} collection cards`,
      `${LIMITS.FREE_SEARCHES} card lookups`,
      "Account and dashboard basics",
    ],
  },
  {
    name: "Pro",
    price: formatPrice(PRO_MONTHLY_PRICE),
    cadence: "per month",
    description: "For sellers who want one place for their whole collection.",
    features: [
      "Unlimited collection and inventory",
      "Marketplace listing and selling tools",
      "Profit, fees, and payout reporting",
      "Annual billing available",
    ],
    emphasized: true,
    note: `${formatPrice(PRO_ANNUAL_PRICE)}/yr saves ${formatPrice(ANNUAL_SAVINGS)}`,
  },
  {
    name: "Business",
    price: formatPrice(BUSINESS_MONTHLY_PRICE),
    cadence: "per month",
    description: "For teams and higher-volume operations.",
    features: [
      "Everything in Pro",
      "Bulk cert import and larger workflows",
      `${BUSINESS_INCLUDED_SEATS} seat included, extra seats ${formatPrice(BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE)}/mo`,
      "Role-based team access",
    ],
  },
];

function IconPath({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </svg>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--biz-faint)]">
      {children}
    </p>
  );
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--biz-profit)]" />
      <span>{children}</span>
    </li>
  );
}

function OperationsPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
      <div className="flex items-center justify-between border-b border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--biz-text-strong)]">
            Business workspace
          </p>
          <p className="mt-0.5 text-[11px] text-[color:var(--biz-faint)]">Sample operating view</p>
        </div>
      </div>

      <div className="grid border-b border-[color:var(--biz-border)] sm:grid-cols-3">
        <Metric label="Active inventory" value="428" detail="36 listed" />
        <Metric label="Sales MTD" value="$18.4k" detail="72 orders" />
        <Metric label="Profit MTD" value="$5.7k" detail="31% margin" />
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="min-w-0 border-b border-[color:var(--biz-border)] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--biz-muted)]">
              Inventory queue
            </p>
            <span className="text-[11px] text-[color:var(--biz-faint)]">Ready to list</span>
          </div>
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_64px_76px_56px] gap-x-3 border-y border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-4 py-2 text-[10px] uppercase tracking-[0.1em] text-[color:var(--biz-faint)]">
              <span>Item</span>
              <span>Status</span>
              <span>Listed</span>
              <span className="text-right">Price</span>
            </div>
            {inventoryRows.map((row) => (
              <div
                key={row.item}
                className="grid grid-cols-[minmax(0,1fr)_64px_76px_56px] items-center gap-x-3 border-b border-[color:var(--biz-border-subtle)] px-4 py-3 text-xs"
              >
                <span className="truncate font-medium text-[color:var(--biz-text-strong)]">
                  {row.item}
                </span>
                <span className="text-[color:var(--biz-muted-strong)]">{row.status}</span>
                <span className="text-[color:var(--biz-muted)]">{row.days}</span>
                <span className="text-right font-medium tabular-nums text-[color:var(--biz-text)]">
                  {row.price}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--biz-muted)]">
            Recent activity
          </p>
          <div className="mt-3 space-y-3">
            {activityRows.map((row) => (
              <div key={`${row.label}-${row.time}`} className="border-l border-[color:var(--biz-border-strong)] pl-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium text-[color:var(--biz-text-strong)]">{row.label}</p>
                  <span className="shrink-0 text-[10px] text-[color:var(--biz-faint)]">{row.time}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--biz-muted)]">{row.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-[color:var(--biz-border)] pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--biz-muted)]">
              Built into the marketplace
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Secure checkout", "Stripe payouts", "Shipping labels", "Buyer messaging", "Low fees"].map((feature) => (
                <span
                  key={feature}
                  className="rounded border border-[color:var(--biz-border)] px-2.5 py-1 text-[11px] text-[color:var(--biz-muted-strong)]"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-b border-[color:var(--biz-border)] px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--biz-faint)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--biz-text-strong)]">{value}</p>
      <p className="mt-1 text-xs text-[color:var(--biz-muted)]">{detail}</p>
    </div>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="rounded-lg border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--biz-border-strong)] text-[color:var(--biz-muted-strong)]">
        {feature.icon}
      </div>
      <h3 className="mt-5 text-lg font-semibold leading-snug text-[color:var(--biz-text-strong)]">
        {feature.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--biz-muted)]">
        {feature.description}
      </p>
      <ul className="mt-4 space-y-2 text-sm text-[color:var(--biz-muted-strong)]">
        {feature.points.map((point) => (
          <CheckItem key={point}>{point}</CheckItem>
        ))}
      </ul>
    </article>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <article
      className={`flex h-full flex-col rounded-lg border p-6 ${
        plan.emphasized
          ? "border-[color:var(--biz-primary-border)] bg-[color:var(--biz-surface-raised)]"
          : "border-[color:var(--biz-border)] bg-[color:var(--biz-surface)]"
      }`}
    >
      <div>
        <h3 className="text-lg font-semibold text-[color:var(--biz-text-strong)]">{plan.name}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[color:var(--biz-muted)]">{plan.description}</p>
      </div>

      <div className="mt-6">
        <p className="text-4xl font-semibold tracking-tight text-[color:var(--biz-text-strong)]">
          {plan.price}
        </p>
        <p className="mt-1 text-sm text-[color:var(--biz-faint)]">{plan.cadence}</p>
        {plan.note ? <p className="mt-2 text-xs text-[color:var(--biz-muted)]">{plan.note}</p> : null}
      </div>

      <ul className="mt-6 flex-1 space-y-2.5 text-sm text-[color:var(--biz-muted-strong)]">
        {plan.features.map((feature) => (
          <CheckItem key={feature}>{feature}</CheckItem>
        ))}
      </ul>

      <Link
        href="/signup"
        className={`mt-7 inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
          plan.emphasized
            ? "cc-btn-primary"
            : "cc-btn-secondary"
        }`}
      >
        Start {plan.name}
      </Link>
    </article>
  );
}

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;

        if (user) {
          const hasBusinessAccess = await hasBusinessWorkspaceAccess(supabase as any, user.id);
          if (active) router.replace(hasBusinessAccess ? "/business" : "/dashboard");
          return;
        }
      } finally {
        if (active) setCheckingAuth(false);
      }
    }

    void checkAuth();

    return () => {
      active = false;
    };
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--biz-bg)]">
        <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-white/25" />
      </div>
    );
  }

  return (
    <div className="business-theme min-h-screen overflow-x-hidden bg-[color:var(--biz-bg)] text-[color:var(--biz-text)]">
      <header className="sticky top-0 z-40 border-b border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--biz-border-strong)] bg-[color:var(--biz-surface-raised)] text-[13px] font-bold text-[color:var(--biz-text-strong)]">
              C
            </span>
            <span className="truncate text-lg font-bold tracking-tight text-[color:var(--biz-text-strong)]">
              CardzCheck
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-[13px] text-[color:var(--biz-muted)] md:flex">
            <a href="#platform" className="transition-colors hover:text-[color:var(--biz-text-strong)]">
              Platform
            </a>
            <a href="#workflow" className="transition-colors hover:text-[color:var(--biz-text-strong)]">
              Workflow
            </a>
            <a href="#pricing" className="transition-colors hover:text-[color:var(--biz-text-strong)]">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-md px-3 py-2 text-[13px] text-[color:var(--biz-muted)] transition-colors hover:text-[color:var(--biz-text-strong)] sm:block"
            >
              Login
            </Link>
            <Link href="/signup" className="cc-btn-primary inline-flex min-h-9 items-center rounded-md px-4 text-[13px] font-semibold">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-[0.88fr_1.12fr] lg:pb-20 lg:pt-20">
          <div>
            <SectionLabel>For collectors, sellers, and card shops</SectionLabel>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-[color:var(--biz-text-strong)] sm:text-6xl sm:leading-[1.02]">
              Run your card collection like a business.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[color:var(--biz-muted)] sm:text-lg">
              Manage your entire collection, sell it on the platform, and track your financials like a
              real company — everything you need to grow a card operation, in one workspace.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="cc-btn-primary inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-semibold"
              >
                Start free
              </Link>
              <Link
                href="#platform"
                className="cc-btn-secondary inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-semibold"
              >
                See platform
              </Link>
            </div>

            <div className="mt-9 grid gap-3 text-sm text-[color:var(--biz-muted-strong)] sm:grid-cols-3">
              <div className="border-l border-[color:var(--biz-border-strong)] pl-3">
                <p className="font-semibold text-[color:var(--biz-text-strong)]">Collection</p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--biz-muted)]">
                  Cost, value, condition, grade, location.
                </p>
              </div>
              <div className="border-l border-[color:var(--biz-border-strong)] pl-3">
                <p className="font-semibold text-[color:var(--biz-text-strong)]">Marketplace</p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--biz-muted)]">
                  List, sell, ship, and get paid in-platform.
                </p>
              </div>
              <div className="border-l border-[color:var(--biz-border-strong)] pl-3">
                <p className="font-semibold text-[color:var(--biz-text-strong)]">Financials</p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--biz-muted)]">
                  Revenue, fees, COGS, payout, P&amp;L.
                </p>
              </div>
            </div>
          </div>

          <OperationsPreview />
        </section>

        <section id="platform" className="scroll-mt-24 border-y border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)]">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="max-w-2xl">
              <SectionLabel>Platform</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--biz-text-strong)] sm:text-4xl">
                Everything your card business needs, in one place.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[color:var(--biz-muted)]">
                Your collection, the marketplace, and your financials live together — so the same card
                moves from your shelf to a sold, paid-out order without losing the numbers behind it.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <SectionLabel>Workflow</SectionLabel>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--biz-text-strong)] sm:text-4xl">
                  From intake to payout.
                </h2>
                <p className="mt-4 text-sm leading-7 text-[color:var(--biz-muted)]">
                  CardzCheck keeps the operational record together so the same item can move through intake,
                  listing, sale, and reconciliation without losing context.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {workflow.map((step) => (
                  <article key={step.label} className="rounded-lg border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-5">
                    <p className="text-xs font-semibold text-[color:var(--biz-faint)]">{step.label}</p>
                    <h3 className="mt-3 text-base font-semibold text-[color:var(--biz-text-strong)]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--biz-muted)]">{step.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div>
              <SectionLabel>The marketplace</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--biz-text-strong)] sm:text-4xl">
                Sell on the CardzCheck Marketplace.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[color:var(--biz-muted)]">
                List straight from your collection and the platform handles the rest — checkout, payouts,
                and shipping — then writes every sale back to your books automatically.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["List from your collection", "Turn a card you already own into a live listing in one click — no re-entering details."],
                ["Get paid securely", "Buyers check out on-platform and you're paid through built-in Stripe payouts."],
                ["Shipping built in", "Buy a prepaid label and hand off tracking the moment an order comes in."],
                ["Low seller fees", "Keep more of every sale, with seller fees as low as 1% — a fraction of the big marketplaces."],
              ].map(([title, body]) => (
                <article key={title} className="rounded-lg border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-5">
                  <h3 className="text-base font-semibold text-[color:var(--biz-text-strong)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--biz-muted)]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="max-w-2xl">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--biz-text-strong)] sm:text-4xl">
                Start small. Upgrade when the operation needs it.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.name} plan={plan} />
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="border-t border-[color:var(--biz-border)] py-14">
            <div className="max-w-2xl">
              <SectionLabel>Get started</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--biz-text-strong)] sm:text-4xl">
                Put the business in one place.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[color:var(--biz-muted)]">
                Create an account, add your first items, and move inventory through selling workflows with a clean record behind it.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="cc-btn-primary inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-semibold"
              >
                Start free
              </Link>
              <Link
                href="/login"
                className="cc-btn-secondary inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-semibold"
              >
                Login
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-bold tracking-tight text-[color:var(--biz-text-strong)]">CardzCheck</p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[color:var(--biz-muted)]">
              Inventory, selling, and ledger software for card businesses.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-[13px] text-[color:var(--biz-muted)] sm:grid-cols-4">
            <Link href="#platform" className="hover:text-[color:var(--biz-text-strong)]">Platform</Link>
            <Link href="#pricing" className="hover:text-[color:var(--biz-text-strong)]">Pricing</Link>
            <Link href="/help" className="hover:text-[color:var(--biz-text-strong)]">Help</Link>
            <Link href="/terms" className="hover:text-[color:var(--biz-text-strong)]">Terms</Link>
            <Link href="/privacy" className="hover:text-[color:var(--biz-text-strong)]">Privacy</Link>
            <Link href="/marketplace" className="hover:text-[color:var(--biz-text-strong)]">Marketplace</Link>
            <Link href="/login" className="hover:text-[color:var(--biz-text-strong)]">Login</Link>
            <Link href="/signup" className="hover:text-[color:var(--biz-text-strong)]">Signup</Link>
          </div>
        </div>
        <div className="border-t border-[color:var(--biz-border)] px-5 py-4 text-center text-[12px] text-[color:var(--biz-faint)]">
          (c) {new Date().getFullYear()} CardzCheck. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
