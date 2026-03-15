import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { getScanCreditStatus } from "@/lib/grading/scanCredits";
import type { Subscription, Usage } from "@/types";

export interface AccessCheck {
  hasAccess: boolean;
  isPro: boolean;
  isBusiness: boolean;
  isActivated: boolean;
  subscriptionStatus: string | null;
  periodEnd: string | null;
  tier: "free" | "pro" | "business";
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

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!subscription) {
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
  const isPro = sub.tier === "pro" || sub.tier === "business";
  const isBusiness = sub.tier === "business";
  const isActive = sub.status === "active";
  const notExpired =
    !sub.current_period_end ||
    new Date(sub.current_period_end) > new Date();

  return {
    hasAccess: isPro && isActive && notExpired,
    isPro,
    isBusiness: isBusiness && isActive && notExpired,
    isActivated: sub.activation_paid,
    subscriptionStatus: sub.status,
    periodEnd: sub.current_period_end,
    tier: sub.tier,
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
