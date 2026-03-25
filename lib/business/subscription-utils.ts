export function isBusinessSubscriptionActive(
  subscriptionStatus: string | null | undefined,
  currentPeriodEnd: string | null | undefined
): boolean {
  const status = (subscriptionStatus || "").toLowerCase();
  const statusActive =
    status === "active" || status === "trialing" || status === "past_due";

  if (!statusActive) return false;

  if (!currentPeriodEnd) return true;
  const periodEnd = new Date(currentPeriodEnd);
  if (Number.isNaN(periodEnd.getTime())) return true;
  return periodEnd > new Date();
}
