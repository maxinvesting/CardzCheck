"use client";

import { useState } from "react";

const PROJECT_ID = "bnhcngudpfswzuyuyesn";
const SQL_EDITOR_URL = `https://supabase.com/dashboard/project/${PROJECT_ID}/sql/new`;

const MIGRATION_SQL = `-- Run this in your Supabase SQL Editor to enable the Business inventory feature
-- https://supabase.com/dashboard/project/${PROJECT_ID}/sql/new

CREATE TABLE IF NOT EXISTS public.business_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  card_id text,
  title text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  acquisition_date date,
  acquisition_type text NOT NULL DEFAULT 'buy'
    CHECK (acquisition_type IN ('buy','trade','rip','consignment','other')),
  cost_basis_total_cents int NOT NULL DEFAULT 0,
  tax_cents int NOT NULL DEFAULT 0,
  shipping_cents int NOT NULL DEFAULT 0,
  fees_paid_cents int NOT NULL DEFAULT 0,
  condition_status text NOT NULL DEFAULT 'raw'
    CHECK (condition_status IN ('raw','graded')),
  grading_company text,
  grade text,
  cert_number text,
  location text,
  channel text NOT NULL DEFAULT 'other'
    CHECK (channel IN ('ebay','whatnot','instagram','show','local','other')),
  status text NOT NULL DEFAULT 'unlisted'
    CHECK (status IN ('unlisted','listed','pending_sale','sold','returned')),
  list_price_cents int,
  current_market_value_cents int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_inventory_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_inventory_items' AND policyname = 'Users can read own inventory') THEN
    CREATE POLICY "Users can read own inventory" ON public.business_inventory_items FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_inventory_items' AND policyname = 'Users can insert own inventory') THEN
    CREATE POLICY "Users can insert own inventory" ON public.business_inventory_items FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_inventory_items' AND policyname = 'Users can update own inventory') THEN
    CREATE POLICY "Users can update own inventory" ON public.business_inventory_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_inventory_items' AND policyname = 'Users can delete own inventory') THEN
    CREATE POLICY "Users can delete own inventory" ON public.business_inventory_items FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.business_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  inventory_item_id uuid NOT NULL REFERENCES public.business_inventory_items(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  sale_price_cents int NOT NULL,
  platform_fees_cents int NOT NULL DEFAULT 0,
  shipping_charged_cents int NOT NULL DEFAULT 0,
  shipping_paid_cents int NOT NULL DEFAULT 0,
  other_costs_cents int NOT NULL DEFAULT 0,
  net_proceeds_cents int NOT NULL DEFAULT 0,
  profit_cents int NOT NULL DEFAULT 0,
  order_id text,
  buyer_handle text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_sales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_sales' AND policyname = 'Users can read own sales') THEN
    CREATE POLICY "Users can read own sales" ON public.business_sales FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_sales' AND policyname = 'Users can insert own sales') THEN
    CREATE POLICY "Users can insert own sales" ON public.business_sales FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_sales' AND policyname = 'Users can update own sales') THEN
    CREATE POLICY "Users can update own sales" ON public.business_sales FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'business_sales' AND policyname = 'Users can delete own sales') THEN
    CREATE POLICY "Users can delete own sales" ON public.business_sales FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Auto-compute net_proceeds + profit on insert/update
CREATE OR REPLACE FUNCTION public.compute_sale_financials()
RETURNS trigger AS $$
DECLARE
  item_cost int;
BEGIN
  NEW.net_proceeds_cents :=
    NEW.sale_price_cents
    - NEW.platform_fees_cents
    - NEW.shipping_paid_cents
    - NEW.other_costs_cents
    + NEW.shipping_charged_cents;
  SELECT COALESCE(cost_basis_total_cents, 0) INTO item_cost
    FROM public.business_inventory_items WHERE id = NEW.inventory_item_id;
  NEW.profit_cents := NEW.net_proceeds_cents - item_cost;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_sales_compute ON public.business_sales;
CREATE TRIGGER trg_business_sales_compute
  BEFORE INSERT OR UPDATE ON public.business_sales
  FOR EACH ROW EXECUTE FUNCTION public.compute_sale_financials();`;

interface Props {
  onRetry: () => void;
}

export default function BusinessMigrationBanner({ onRetry }: Props) {
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-amber-700/40 bg-amber-900/10 p-6 space-y-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-900/40 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-amber-300">Database setup required</h3>
          <p className="text-sm text-amber-200/70 mt-1">
            The business inventory tables haven't been created in your database yet. Run a one-time SQL migration to get started.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={SQL_EDITOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Supabase SQL Editor
        </a>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-700"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy SQL
            </>
          )}
        </button>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Retry
        </button>
      </div>

      <div>
        <button
          onClick={() => setShowSql(!showSql)}
          className="text-xs text-amber-400/70 hover:text-amber-400 flex items-center gap-1"
        >
          <svg
            className={`w-3 h-3 transition-transform ${showSql ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showSql ? "Hide SQL" : "View SQL migration"}
        </button>
        {showSql && (
          <pre className="mt-3 p-4 bg-gray-950 border border-gray-800 rounded-xl text-xs text-gray-400 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
            {MIGRATION_SQL}
          </pre>
        )}
      </div>

      <div className="text-xs text-amber-200/50 flex items-start gap-2">
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          Steps: 1) Click <em>Open Supabase SQL Editor</em> → 2) Click <em>Copy SQL</em> and paste it → 3) Click <em>Run</em> in Supabase → 4) Come back and click <em>Retry</em>
        </span>
      </div>
    </div>
  );
}
