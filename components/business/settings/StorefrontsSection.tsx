"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  UserStorefront,
  StorefrontPlatform,
  StorefrontPlatformSettings,
  WhatnotStorefrontSettings,
  WebsiteStorefrontSettings,
  ShopifyStorefrontSettings,
  MercariStorefrontSettings,
} from "@/types";
import {
  STOREFRONT_PLATFORMS,
  WHATNOT_DEFAULTS,
  WEBSITE_DEFAULTS,
  MERCARI_DEFAULTS,
  SHOPIFY_DEFAULTS,
  AD_PLATFORM_OPTIONS,
  getDefaultPlatformSettings,
} from "@/types";

function PlatformIcon({ platform }: { platform: StorefrontPlatform }) {
  switch (platform) {
    case "ebay":
      return (
        <span className="text-xs font-extrabold tracking-tight">
          <span style={{ color: "#e43137" }}>e</span>
          <span style={{ color: "#0064d3" }}>B</span>
          <span style={{ color: "#f5af02" }}>a</span>
          <span style={{ color: "#86b817" }}>y</span>
        </span>
      );
    case "whatnot":
      return <span className="text-sm font-bold text-orange-500">W</span>;
    case "shopify":
      return <span className="text-sm font-bold text-green-500">S</span>;
    case "mercari":
      return <span className="text-sm font-bold text-red-500">M</span>;
    case "website":
      return (
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      );
  }
}

function getPlatformMeta(platform: StorefrontPlatform) {
  return STOREFRONT_PLATFORMS.find((p) => p.value === platform) ?? STOREFRONT_PLATFORMS[STOREFRONT_PLATFORMS.length - 1];
}

function fmtDollars(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "$0";
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return `${pct}%`;
}

function SettingsSummaryBadges({ platform, settings }: { platform: StorefrontPlatform; settings: StorefrontPlatformSettings }) {
  const badges: { label: string; color: string }[] = [];

  if (platform === "whatnot") {
    const s = settings as WhatnotStorefrontSettings;
    if (s.seller_fee_percent != null) badges.push({ label: `${s.seller_fee_percent}% seller fee`, color: "orange" });
    if (s.buyer_premium_percent) badges.push({ label: `${s.buyer_premium_percent}% buyer premium`, color: "amber" });
    if (s.payment_processing_percent) badges.push({ label: `${s.payment_processing_percent}% processing`, color: "gray" });
  } else if (platform === "website") {
    const s = settings as WebsiteStorefrontSettings;
    if (s.monthly_ad_spend_cents) badges.push({ label: `${fmtDollars(s.monthly_ad_spend_cents)}/mo ads`, color: "purple" });
    if (s.monthly_hosting_cents) badges.push({ label: `${fmtDollars(s.monthly_hosting_cents)}/mo hosting`, color: "blue" });
    if (s.monthly_other_costs_cents) badges.push({ label: `${fmtDollars(s.monthly_other_costs_cents)}/mo ${s.other_costs_label || "other"}`, color: "gray" });
    if (s.payment_processing_percent) badges.push({ label: `${s.payment_processing_percent}% + ${fmtDollars(s.payment_flat_fee_cents ?? 30)} processing`, color: "gray" });
    if (s.ad_platforms?.length) badges.push({ label: s.ad_platforms.join(", "), color: "indigo" });
  } else if (platform === "mercari") {
    const s = settings as MercariStorefrontSettings;
    if (s.seller_fee_percent != null) badges.push({ label: `${s.seller_fee_percent}% seller fee`, color: "red" });
  } else if (platform === "shopify") {
    const s = settings as ShopifyStorefrontSettings;
    if (s.monthly_plan_cents) badges.push({ label: `${fmtDollars(s.monthly_plan_cents)}/mo plan`, color: "green" });
    if (s.payment_processing_percent) badges.push({ label: `${s.payment_processing_percent}% processing`, color: "gray" });
  }

  if (badges.length === 0) return null;

  const colorMap: Record<string, string> = {
    orange: "bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    green: "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    indigo: "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",
    gray: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badges.map((b, i) => (
        <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colorMap[b.color] ?? colorMap.gray}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Whatnot settings fields
// ────────────────────────────────────────────────────────────────────────────

function WhatnotSettingsFields({
  settings,
  onChange,
}: {
  settings: WhatnotStorefrontSettings;
  onChange: (s: WhatnotStorefrontSettings) => void;
}) {
  return (
    <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 p-4 space-y-3">
      <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Whatnot Fees</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Seller Fee %
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.seller_fee_percent ?? ""}
              onChange={(e) => onChange({ ...settings, seller_fee_percent: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="9.5"
              className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Whatnot&apos;s cut per sale</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Buyer Premium %
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.buyer_premium_percent ?? ""}
              onChange={(e) => onChange({ ...settings, buyer_premium_percent: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="3"
              className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Charged to buyer</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Payment Processing %
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.payment_processing_percent ?? ""}
              onChange={(e) => onChange({ ...settings, payment_processing_percent: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="2.9"
              className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Card processing fee</p>
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
          Shipping Fee %
        </label>
        <div className="relative max-w-[160px]">
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={settings.shipping_fee_percent ?? ""}
            onChange={(e) => onChange({ ...settings, shipping_fee_percent: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="0"
            className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">Shipping label markup (if applicable)</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Website settings fields
// ────────────────────────────────────────────────────────────────────────────

function WebsiteSettingsFields({
  settings,
  onChange,
}: {
  settings: WebsiteStorefrontSettings;
  onChange: (s: WebsiteStorefrontSettings) => void;
}) {
  function toggleAdPlatform(name: string) {
    const current = settings.ad_platforms ?? [];
    const next = current.includes(name)
      ? current.filter((p) => p !== name)
      : [...current, name];
    onChange({ ...settings, ad_platforms: next });
  }

  return (
    <div className="space-y-4">
      {/* Payment Processing */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Payment Processing</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              Processor
            </label>
            <select
              value={settings.payment_processor ?? "Stripe"}
              onChange={(e) => onChange({ ...settings, payment_processor: e.target.value })}
              className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Stripe">Stripe</option>
              <option value="PayPal">PayPal</option>
              <option value="Square">Square</option>
              <option value="Other">Other</option>
              <option value="None">None / N/A</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              Rate %
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={settings.payment_processing_percent ?? ""}
                onChange={(e) => onChange({ ...settings, payment_processing_percent: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="2.9"
                className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              Flat Fee / Txn
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={settings.payment_flat_fee_cents != null ? settings.payment_flat_fee_cents / 100 : ""}
                onChange={(e) => onChange({ ...settings, payment_flat_fee_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                placeholder="0.30"
                className="w-full px-3 py-1.5 pl-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ad Spending */}
      <div className="rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-900/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Advertising</p>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Monthly Ad Spend
          </label>
          <div className="relative max-w-[200px]">
            <input
              type="number"
              step="1"
              min="0"
              value={settings.monthly_ad_spend_cents != null ? settings.monthly_ad_spend_cents / 100 : ""}
              onChange={(e) => onChange({ ...settings, monthly_ad_spend_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0 })}
              placeholder="0.00"
              className="w-full px-3 py-1.5 pl-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Total monthly ad budget across all platforms</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            Ad Platforms
          </label>
          <div className="flex flex-wrap gap-1.5">
            {AD_PLATFORM_OPTIONS.map((name) => {
              const active = (settings.ad_platforms ?? []).includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleAdPlatform(name)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    active
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly Costs */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Monthly Operating Costs</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              Hosting / Domain
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                value={settings.monthly_hosting_cents != null ? settings.monthly_hosting_cents / 100 : ""}
                onChange={(e) => onChange({ ...settings, monthly_hosting_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0 })}
                placeholder="0.00"
                className="w-full px-3 py-1.5 pl-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">per month</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              Other Costs
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                value={settings.monthly_other_costs_cents != null ? settings.monthly_other_costs_cents / 100 : ""}
                onChange={(e) => onChange({ ...settings, monthly_other_costs_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0 })}
                placeholder="0.00"
                className="w-full px-3 py-1.5 pl-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Label for Other Costs <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={settings.other_costs_label ?? ""}
            onChange={(e) => onChange({ ...settings, other_costs_label: e.target.value || null })}
            placeholder='e.g. "Email marketing", "Packaging supplies"'
            maxLength={100}
            className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Mercari settings fields
// ────────────────────────────────────────────────────────────────────────────

function MercariSettingsFields({
  settings,
  onChange,
}: {
  settings: MercariStorefrontSettings;
  onChange: (s: MercariStorefrontSettings) => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 p-4 space-y-3">
      <p className="text-xs font-semibold text-red-700 dark:text-red-400">Mercari Fees</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Seller Fee %
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.seller_fee_percent ?? ""}
              onChange={(e) => onChange({ ...settings, seller_fee_percent: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="10"
              className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Mercari takes 10% of sale price</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Payment Processing %
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.payment_processing_percent ?? ""}
              onChange={(e) => onChange({ ...settings, payment_processing_percent: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="2.9"
              className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shopify settings fields
// ────────────────────────────────────────────────────────────────────────────

function ShopifySettingsFields({
  settings,
  onChange,
}: {
  settings: ShopifyStorefrontSettings;
  onChange: (s: ShopifyStorefrontSettings) => void;
}) {
  return (
    <div className="rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10 p-4 space-y-3">
      <p className="text-xs font-semibold text-green-700 dark:text-green-400">Shopify Fees</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Monthly Plan
          </label>
          <div className="relative">
            <input
              type="number"
              step="1"
              min="0"
              value={settings.monthly_plan_cents != null ? settings.monthly_plan_cents / 100 : ""}
              onChange={(e) => onChange({ ...settings, monthly_plan_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
              placeholder="39"
              className="w-full px-3 py-1.5 pl-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">per month</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Transaction Fee %
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.transaction_fee_percent ?? ""}
              onChange={(e) => onChange({ ...settings, transaction_fee_percent: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="0"
              className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">0% with Shopify Payments</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
            Payment Processing %
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.payment_processing_percent ?? ""}
              onChange={(e) => onChange({ ...settings, payment_processing_percent: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="2.9"
              className="w-full px-3 py-1.5 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Renders the right settings fields for a given platform
// ────────────────────────────────────────────────────────────────────────────

function PlatformSettingsFields({
  platform,
  settings,
  onChange,
}: {
  platform: StorefrontPlatform;
  settings: StorefrontPlatformSettings;
  onChange: (s: StorefrontPlatformSettings) => void;
}) {
  switch (platform) {
    case "whatnot":
      return (
        <WhatnotSettingsFields
          settings={{ ...WHATNOT_DEFAULTS, ...settings } as WhatnotStorefrontSettings}
          onChange={onChange}
        />
      );
    case "website":
      return (
        <WebsiteSettingsFields
          settings={{ ...WEBSITE_DEFAULTS, ...settings } as WebsiteStorefrontSettings}
          onChange={onChange}
        />
      );
    case "mercari":
      return (
        <MercariSettingsFields
          settings={{ ...MERCARI_DEFAULTS, ...settings } as MercariStorefrontSettings}
          onChange={onChange}
        />
      );
    case "shopify":
      return (
        <ShopifySettingsFields
          settings={{ ...SHOPIFY_DEFAULTS, ...settings } as ShopifyStorefrontSettings}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main section
// ────────────────────────────────────────────────────────────────────────────

export default function StorefrontsSection() {
  const [storefronts, setStorefronts] = useState<UserStorefront[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchStorefronts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/business/storefronts");
      if (!res.ok) throw new Error("Failed to load storefronts");
      const data = await res.json();
      setStorefronts(data.storefronts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStorefronts();
  }, [fetchStorefronts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Connect your storefronts so CardzCheck can integrate with your selling platforms. Add your eBay store, Whatnot profile, personal website, or any marketplace where you sell.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {storefronts.length === 0 && !showAdd && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                No storefronts connected yet
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                Add your selling platforms to integrate them with your CardzCheck business tools.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Storefront
              </button>
            </div>
          )}

          {storefronts.length > 0 && (
            <div className="space-y-2">
              {storefronts.map((sf) =>
                editingId === sf.id ? (
                  <StorefrontEditForm
                    key={sf.id}
                    storefront={sf}
                    onSaved={() => {
                      setEditingId(null);
                      fetchStorefronts();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <StorefrontCard
                    key={sf.id}
                    storefront={sf}
                    onEdit={() => setEditingId(sf.id)}
                    onDelete={async () => {
                      if (!confirm(`Remove "${sf.display_name}" storefront?`)) return;
                      try {
                        const res = await fetch(`/api/business/storefronts/${sf.id}`, {
                          method: "DELETE",
                        });
                        if (!res.ok) throw new Error("Delete failed");
                        fetchStorefronts();
                      } catch {
                        setError("Failed to remove storefront");
                      }
                    }}
                    onSetPrimary={async () => {
                      try {
                        const res = await fetch(`/api/business/storefronts/${sf.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_primary: true }),
                        });
                        if (!res.ok) throw new Error("Update failed");
                        fetchStorefronts();
                      } catch {
                        setError("Failed to set primary storefront");
                      }
                    }}
                  />
                )
              )}
            </div>
          )}

          {showAdd ? (
            <StorefrontAddForm
              onAdded={() => {
                setShowAdd(false);
                fetchStorefronts();
              }}
              onCancel={() => setShowAdd(false)}
            />
          ) : storefronts.length > 0 ? (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Another Storefront
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Storefront card (read view)
// ────────────────────────────────────────────────────────────────────────────

function StorefrontCard({
  storefront,
  onEdit,
  onDelete,
  onSetPrimary,
}: {
  storefront: UserStorefront;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
}) {
  const meta = getPlatformMeta(storefront.platform);
  const hasSettings = storefront.platform_settings && Object.keys(storefront.platform_settings).length > 0;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4 group">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
          <PlatformIcon platform={storefront.platform} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {storefront.display_name}
            </p>
            {storefront.is_primary && (
              <span className="shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                Primary
              </span>
            )}
            <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              {meta.label}
            </span>
          </div>
          <a
            href={storefront.store_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 truncate block"
          >
            {storefront.store_url}
          </a>
          {storefront.notes && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
              {storefront.notes}
            </p>
          )}
          {hasSettings && (
            <SettingsSummaryBadges platform={storefront.platform} settings={storefront.platform_settings} />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!storefront.is_primary && (
            <button
              onClick={onSetPrimary}
              title="Set as primary"
              className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            title="Remove"
            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Add form
// ────────────────────────────────────────────────────────────────────────────

function StorefrontAddForm({
  onAdded,
  onCancel,
}: {
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState<StorefrontPlatform>("ebay");
  const [displayName, setDisplayName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<StorefrontPlatformSettings>(getDefaultPlatformSettings("ebay"));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const meta = getPlatformMeta(platform);

  useEffect(() => {
    if (!displayName || STOREFRONT_PLATFORMS.some((p) => p.label === displayName)) {
      setDisplayName(meta.label);
    }
    setPlatformSettings(getDefaultPlatformSettings(platform));
  }, [platform, meta.label, displayName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/business/storefronts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          display_name: displayName.trim(),
          store_url: storeUrl.trim(),
          is_primary: isPrimary,
          notes: notes.trim() || null,
          platform_settings: platformSettings,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add storefront");
      }

      onAdded();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add storefront");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-5 space-y-4"
    >
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
        Add Storefront
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Platform
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as StorefrontPlatform)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STOREFRONT_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My eBay Store"
            maxLength={100}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          Store URL
        </label>
        <input
          type="url"
          value={storeUrl}
          onChange={(e) => setStoreUrl(e.target.value)}
          placeholder={meta.placeholder}
          maxLength={2048}
          required
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <PlatformSettingsFields
        platform={platform}
        settings={platformSettings}
        onChange={setPlatformSettings}
      />

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Sports cards only, vintage store..."
          maxLength={500}
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">
          Set as primary storefront (used for &quot;Open Store&quot; shortcut)
        </span>
      </label>

      {formError && (
        <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !storeUrl.trim() || !displayName.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Adding..." : "Add Storefront"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Edit form
// ────────────────────────────────────────────────────────────────────────────

function StorefrontEditForm({
  storefront,
  onSaved,
  onCancel,
}: {
  storefront: UserStorefront;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState<StorefrontPlatform>(storefront.platform);
  const [displayName, setDisplayName] = useState(storefront.display_name);
  const [storeUrl, setStoreUrl] = useState(storefront.store_url);
  const [notes, setNotes] = useState(storefront.notes ?? "");
  const [platformSettings, setPlatformSettings] = useState<StorefrontPlatformSettings>(
    storefront.platform_settings ?? getDefaultPlatformSettings(storefront.platform)
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const meta = getPlatformMeta(platform);

  useEffect(() => {
    if (platform !== storefront.platform) {
      setPlatformSettings(getDefaultPlatformSettings(platform));
    }
  }, [platform, storefront.platform]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/business/storefronts/${storefront.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          display_name: displayName.trim(),
          store_url: storeUrl.trim(),
          notes: notes.trim() || null,
          platform_settings: platformSettings,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update storefront");
      }

      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update storefront");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10 p-5 space-y-4"
    >
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
        Edit Storefront
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Platform
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as StorefrontPlatform)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STOREFRONT_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          Store URL
        </label>
        <input
          type="url"
          value={storeUrl}
          onChange={(e) => setStoreUrl(e.target.value)}
          placeholder={meta.placeholder}
          maxLength={2048}
          required
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <PlatformSettingsFields
        platform={platform}
        settings={platformSettings}
        onChange={setPlatformSettings}
      />

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Sports cards only, vintage store..."
          maxLength={500}
          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {formError && (
        <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !storeUrl.trim() || !displayName.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
