export type SubscriptionTier = "free" | "pro" | "business";

export type SubscriptionTierRow = {
  tier?: string | null;
  status?: string | null;
  current_period_end?: string | null;
};

function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === "active";
}

function isNotExpired(currentPeriodEnd: string | null | undefined): boolean {
  if (!currentPeriodEnd) return true;
  return new Date(currentPeriodEnd) > new Date();
}

export function hasActiveBusinessTier(
  subscription: SubscriptionTierRow | null | undefined
): boolean {
  if (!subscription) return false;
  return (
    subscription.tier === "business" &&
    isSubscriptionActive(subscription.status) &&
    isNotExpired(subscription.current_period_end)
  );
}

export function hasActiveProTier(
  subscription: SubscriptionTierRow | null | undefined
): boolean {
  if (!subscription) return false;
  const isProLike =
    subscription.tier === "pro" || subscription.tier === "business";
  return (
    isProLike &&
    isSubscriptionActive(subscription.status) &&
    isNotExpired(subscription.current_period_end)
  );
}

