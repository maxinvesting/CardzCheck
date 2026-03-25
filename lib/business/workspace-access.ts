import { hasActiveBusinessTier } from "@/lib/subscription-tier";
import { isBusinessSubscriptionActive } from "@/lib/business/context";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

type MembershipProbeRow = {
  business_accounts?:
    | { subscription_status?: string | null; current_period_end?: string | null }
    | Array<{ subscription_status?: string | null; current_period_end?: string | null }>
    | null;
};

function getAccountProbe(
  row: MembershipProbeRow | null | undefined
): { subscription_status?: string | null; current_period_end?: string | null } | null {
  if (!row?.business_accounts) return null;
  if (Array.isArray(row.business_accounts)) {
    return row.business_accounts[0] ?? null;
  }
  return row.business_accounts;
}

export async function hasBusinessWorkspaceAccess(
  supabase: SupabaseLike,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("business_memberships")
      .select(
        "business_accounts!inner(subscription_status, current_period_end)"
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const account = getAccountProbe(data as MembershipProbeRow);
      if (!account) return false;
      return isBusinessSubscriptionActive(
        account.subscription_status,
        account.current_period_end
      );
    }

    const code = String((error as { code?: string } | null)?.code ?? "");
    const message = String(
      (error as { message?: string } | null)?.message ?? ""
    ).toLowerCase();

    const missingTeamSchema =
      code === "PGRST205" ||
      code === "42P01" ||
      message.includes("business_memberships") ||
      message.includes("business_accounts");

    if (!missingTeamSchema) {
      return false;
    }
  } catch {
    // Fall through to legacy subscription probe.
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  return hasActiveBusinessTier(sub);
}
