/**
 * Feature access and usage limit helpers — SERVER ONLY.
 *
 * Subscription tiers:
 *  free     — 3 searches/mo, 3 AI messages/mo, 5 collection items, no watchlist
 *  pro      — Unlimited search/AI/collection, watchlist, grade estimator
 *  business — All Pro features + inventory, sales, eBay integration, analytics
 *
 * Usage pattern:
 *   1. checkProAccess(userId) — get tier + status
 *   2. canAccessFeature(userId, feature) — per-feature access gate
 *   3. getUsage(userId) — read free-tier counters
 *   4. incrementSearchUsage / incrementAIUsage — call after successful operations
 *
 * These checks are always enforced server-side. Client-side gating (PaywallModal)
 * is UX only — API routes enforce access independently and must not trust client
 * claims about subscription status.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { getScanCreditStatus } from "@/lib/grading/scanCredits";
import { hasBusinessWorkspaceAccess } from "@/lib/business/workspace-access";
import type {
  EffectiveTier,
  Subscription,
  SubscriptionTier,
  Usage,
} from "@/types";

// ---------------------------------------------------------------------------
// Two-tier model (post-PR C1). Legacy "free" / "pro" enum values still exist
// in the database during the transition and are mapped to "business" here.
// ---------------------------------------------------------------------------

/**
 * Collapse legacy tier values to the three-tier model:
 *   - "free"         — default for new signups; strict caps.
 *   - "business"     — paid base; mid caps.
 *   - "business_pro" — paid top; unlimited.
 *
 * Legacy "pro" rows map to "business" (we collapsed Pro into Business
 * in PR C1).
 */
export function effectiveTier(raw: SubscriptionTier | null | undefined): EffectiveTier {
  if (raw === "business_pro") return "business_pro";
  if (raw === "business" || raw === "pro") return "business";
  return "free";
}

/**
 * Per-tier feature gates. Single source of truth so UI and API paths agree.
 * Add new gates here rather than copy/pasting tier strings across components.
 */
export interface TierGates {
  tier: EffectiveTier;
  /** Bulk PSA cert import + paste-many flows. */
  canBulkAddByCert: boolean;
  /** Multi-card grading scan sessions (>1 slot). */
  canMultiCardScan: boolean;
  /** Max simultaneous grading scan slots. */
  maxGradeScanSlots: number;
  /**
   * Rolling 7-day analyst message cap.
   *   null     = unlimited (Business Pro)
   *   0        = blocked entirely (Free — first message paywalls)
   *   positive = max messages per 7-day window (Business: 3)
   */
  analystWeeklyLimit: number | null;
  /** Cap on total inventory items. null = unlimited. */
  inventoryItemCap: number | null;
  /** Can list cards for sale on the marketplace. */
  canSellOnMarketplace: boolean;
  /**
   * Marketplace fee rates by listing tier. The marketplace already has
   * "self-serve / full-service-low / full-service-high" tiers driven by
   * card grade + comps depth; this adds a subscription multiplier on top.
   * Values are decimals (0.05 = 5%). Use the matching key in
   * lib/marketplace/fees.ts.
   */
  marketplaceFees: { one_pct: number; two_pct: number; five_pct: number };
}

export function tierGates(tier: EffectiveTier): TierGates {
  if (tier === "business_pro") {
    return {
      tier,
      canBulkAddByCert: true,
      canMultiCardScan: true,
      maxGradeScanSlots: 10,
      analystWeeklyLimit: null,
      inventoryItemCap: null,
      canSellOnMarketplace: true,
      // Pro keeps the headline 1% / 2% / 5% rates.
      marketplaceFees: { one_pct: 0.01, two_pct: 0.02, five_pct: 0.05 },
    };
  }
  if (tier === "business") {
    return {
      tier,
      canBulkAddByCert: false,
      canMultiCardScan: false,
      maxGradeScanSlots: 1,
      analystWeeklyLimit: 3,
      inventoryItemCap: null,
      canSellOnMarketplace: true,
      // Business pays 3 points more across the board.
      marketplaceFees: { one_pct: 0.04, two_pct: 0.05, five_pct: 0.08 },
    };
  }
  // free
  return {
    tier,
    canBulkAddByCert: false,
    canMultiCardScan: false,
    maxGradeScanSlots: 1,
    // Free hits the paywall on first analyst message.
    analystWeeklyLimit: 0,
    inventoryItemCap: 10,
    // Free can list but at top-tier fees.
    canSellOnMarketplace: true,
    marketplaceFees: { one_pct: 0.08, two_pct: 0.12, five_pct: 0.15 },
  };
}

/**
 * Server-side helper: look up the caller's effective tier + gates in one go.
 * Falls back to "business" (the more restrictive tier) if no subscription
 * row exists yet — safer than assuming Pro.
 */
export async function getTierGates(userId: string): Promise<TierGates> {
  if (isTestMode()) return tierGates("business_pro");
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  return tierGates(effectiveTier((data?.tier ?? null) as SubscriptionTier | null));
}

/**
 * Atomic: try to consume one analyst message for this user this week.
 * Returns true if allowed (and the counter was incremented), false if the
 * weekly cap is exhausted.
 *
 *   weeklyLimit === null → unlimited (Business Pro). Always returns true.
 *   weeklyLimit === 0    → blocked (Free). Always returns false.
 *   weeklyLimit > 0      → enforce rolling-week cap via the RPC.
 *
 * Backed by the `consume_weekly_analyst_message` RPC.
 */
export async function consumeWeeklyAnalystMessage(
  userId: string,
  weeklyLimit: number | null
): Promise<boolean> {
  if (isTestMode()) return true;
  if (weeklyLimit === null) return true;
  if (weeklyLimit <= 0) return false;
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("consume_weekly_analyst_message", {
    p_user_id: userId,
    p_weekly_limit: weeklyLimit,
  });
  if (error) {
    console.error("[access] consume_weekly_analyst_message failed:", error);
    // Fail closed — refuse the message rather than allow free use on a DB error.
    return false;
  }
  return Boolean(data);
}

export interface WeeklyAnalystUsage {
  messagesUsed: number;
  weekStart: string | null;
  resetsAt: string | null;
}

export async function getWeeklyAnalystUsage(
  userId: string
): Promise<WeeklyAnalystUsage> {
  if (isTestMode()) return { messagesUsed: 0, weekStart: null, resetsAt: null };
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("get_weekly_analyst_usage", { p_user_id: userId })
    .single();
  return {
    messagesUsed: (data as any)?.messages_used ?? 0,
    weekStart: (data as any)?.week_start ?? null,
    resetsAt: (data as any)?.resets_at ?? null,
  };
}

export interface AccessCheck {
  hasAccess: boolean;
  isPro: boolean;
  isBusiness: boolean;
  isActivated: boolean;
  subscriptionStatus: string | null;
  periodEnd: string | null;
  tier: SubscriptionTier;
}

export interface UsageCheck {
  searchesUsed: number;
  aiMessagesUsed: number;
  canSearch: boolean;
  canUseAI: boolean;
}

/**
 * Check if user has Pro access via the subscription system.
 * Business tier includes all Pro features.
 */
export async function checkProAccess(userId: string): Promise<AccessCheck> {
  if (isTestMode()) {
    return {
      hasAccess: true,
      isPro: true,
      isBusiness: false,
      isActivated: true,
      subscriptionStatus: "active",
      periodEnd: null,
      tier: "pro",
    };
  }

  const supabase = await createClient();
  const businessWorkspaceAccess = await hasBusinessWorkspaceAccess(
    supabase as any,
    userId
  );

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!subscription) {
    if (businessWorkspaceAccess) {
      return {
        hasAccess: true,
        isPro: true,
        isBusiness: true,
        isActivated: true,
        subscriptionStatus: "active",
        periodEnd: null,
        tier: "business",
      };
    }

    return {
      hasAccess: false,
      isPro: false,
      isBusiness: false,
      isActivated: false,
      subscriptionStatus: null,
      periodEnd: null,
      tier: "free",
    };
  }

  const sub = subscription as Subscription;
  const isProBySubscription = sub.tier === "pro" || sub.tier === "business";
  const isBusiness = businessWorkspaceAccess;
  const isPro = isProBySubscription || businessWorkspaceAccess;
  const isActive = sub.status === "active";
  const notExpired =
    !sub.current_period_end ||
    new Date(sub.current_period_end) > new Date();
  const hasSubscriptionAccess = isProBySubscription && isActive && notExpired;

  return {
    hasAccess: hasSubscriptionAccess || businessWorkspaceAccess,
    isPro,
    isBusiness,
    isActivated: sub.activation_paid,
    subscriptionStatus: businessWorkspaceAccess ? "active" : sub.status,
    periodEnd: businessWorkspaceAccess ? null : sub.current_period_end,
    tier: businessWorkspaceAccess ? "business" : sub.tier,
  };
}

/**
 * Check if user has Business tier access.
 */
export async function hasBusinessAccess(userId: string): Promise<boolean> {
  if (isTestMode()) return true;

  const access = await checkProAccess(userId);
  return access.isBusiness;
}

/**
 * Backward compatible check - uses new subscription system first,
 * falls back to legacy is_paid flag
 */
export async function checkLegacyProAccess(userId: string): Promise<boolean> {
  // In test mode, return Pro access
  if (isTestMode()) {
    return true;
  }

  const supabase = await createClient();

  // First check new subscription table
  const access = await checkProAccess(userId);
  if (access.hasAccess) return true;

  // Fallback to legacy is_paid flag for backward compatibility
  const { data: user } = await supabase
    .from("users")
    .select("is_paid")
    .eq("id", userId)
    .single();

  return user?.is_paid || false;
}

/**
 * Get usage stats for a user.
 *
 * Pass a pre-fetched `isPro` value when you already have it to avoid a
 * redundant subscription query (e.g. from inside canAccessFeature).
 */
export async function getUsage(
  userId: string,
  isPro?: boolean
): Promise<UsageCheck> {
  // In test mode, return unlimited access
  if (isTestMode()) {
    return {
      searchesUsed: 0,
      aiMessagesUsed: 0,
      canSearch: true,
      canUseAI: true,
    };
  }

  const supabase = await createClient();

  const { data: usage } = await supabase
    .from("usage")
    .select("*")
    .eq("user_id", userId)
    .single();

  const proAccess = isPro !== undefined ? isPro : await checkLegacyProAccess(userId);

  if (proAccess) {
    return {
      searchesUsed: usage?.searches_used || 0,
      aiMessagesUsed: usage?.ai_messages_used || 0,
      canSearch: true,
      canUseAI: true,
    };
  }

  const searchesUsed = usage?.searches_used || 0;
  const aiMessagesUsed = usage?.ai_messages_used || 0;

  return {
    searchesUsed,
    aiMessagesUsed,
    canSearch: searchesUsed < 3,
    canUseAI: aiMessagesUsed < 3,
  };
}

/**
 * Increment search usage count.
 *
 * Uses a Postgres RPC function (increment_search_usage) that executes an
 * INSERT … ON CONFLICT DO UPDATE SET searches_used = searches_used + 1
 * in a single round-trip, eliminating the read-then-write race condition
 * that the previous read → compute → write pattern had.
 *
 * Migration: supabase/migrations/20260314_usage_increment_fns.sql
 */
export async function incrementSearchUsage(userId: string): Promise<void> {
  if (isTestMode()) return;

  const supabase = await createServiceClient();
  const { error } = await supabase.rpc("increment_search_usage", { p_user_id: userId });

  if (error) {
    console.error("[access] incrementSearchUsage RPC failed:", error);
  }
}

/**
 * Increment AI message usage count.
 *
 * Uses the same atomic RPC pattern as incrementSearchUsage.
 * Migration: supabase/migrations/20260314_usage_increment_fns.sql
 */
export async function incrementAIUsage(userId: string): Promise<void> {
  if (isTestMode()) return;

  const supabase = await createServiceClient();
  const { error } = await supabase.rpc("increment_ai_usage", { p_user_id: userId });

  if (error) {
    console.error("[access] incrementAIUsage RPC failed:", error);
  }
}

/**
 * Check if user can access a specific feature
 */
export type Feature =
  | "search"
  | "collection"
  | "watchlist"
  | "ai_chat"
  | "grade_estimator"
  | "business";

export interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
}

export async function canAccessFeature(
  userId: string,
  feature: Feature
): Promise<FeatureAccessResult> {
  const isPro = await checkLegacyProAccess(userId);

  // Pro users have access to everything
  if (isPro) {
    return { allowed: true };
  }

  // Pass isPro=false so getUsage skips its own subscription query.
  const usage = await getUsage(userId, false);

  switch (feature) {
    case "search":
      if (!usage.canSearch) {
        return {
          allowed: false,
          reason: "You've used all 3 free searches. Upgrade for unlimited.",
          upgradeRequired: true,
        };
      }
      return { allowed: true };

    case "collection":
      // Collection limit is checked in the collection API route itself
      return { allowed: true };

    case "watchlist":
      return {
        allowed: false,
        reason: "Watchlist is a Pro feature. Upgrade to track card prices.",
        upgradeRequired: true,
      };

    case "ai_chat":
      if (!usage.canUseAI) {
        return {
          allowed: false,
          reason: "You've used all 3 free AI messages. Upgrade for unlimited.",
          upgradeRequired: true,
        };
      }
      return { allowed: true };

    case "grade_estimator": {
      // Pro and Business subscribers have full access
      if (isPro) return { allowed: true };
      // Free users get 2 lifetime credits + 1/week — check remaining
      const credits = await getScanCreditStatus(userId);
      if (credits.remaining > 0) return { allowed: true };
      return {
        allowed: false,
        reason:
          "You've used all your free scans. Upgrade to Pro for unlimited grade analysis.",
        upgradeRequired: true,
      };
    }

    case "business": {
      const businessAccess = await hasBusinessAccess(userId);
      if (!businessAccess) {
        return {
          allowed: false,
          reason:
            "Business tools require a Business subscription ($15/mo or $150/yr).",
          upgradeRequired: true,
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: false, reason: "Unknown feature" };
  }
}
