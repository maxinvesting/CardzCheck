import { createClient } from "@/lib/supabase/server";

export type BusinessRole = "owner" | "manager" | "employee";

export type BusinessPermissions = {
  canAccessBusiness: boolean;
  canManageOperations: boolean;
  canManageTeam: boolean;
  canManageBilling: boolean;
  canInviteMembers: boolean;
  canManageSeats: boolean;
  canChangeMemberRoles: boolean;
  canRemoveMembers: boolean;
};

export type BusinessSeatSummary = {
  seatsIncluded: number;
  seatQuantity: number;
  purchasedSeats: number;
  activeMembers: number;
  pendingInvites: number;
  usedSeats: number;
  reservedSeats: number;
  availableSeats: number;
};

export type BusinessContext = {
  businessAccountId: string;
  membershipId: string;
  role: BusinessRole;
  ownerUserId: string;
  accountName: string | null;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionItemId: string | null;
  seats: BusinessSeatSummary;
  permissions: BusinessPermissions;
};

type RawBusinessAccount = {
  id: string;
  owner_user_id: string;
  name: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  seats_included: number | null;
  seat_quantity: number | null;
};

type RawMembership = {
  id: string;
  business_account_id: string;
  role: BusinessRole;
  status: string;
  joined_at?: string | null;
  business_accounts?: RawBusinessAccount | RawBusinessAccount[] | null;
};

function roleRank(role: BusinessRole): number {
  switch (role) {
    case "owner":
      return 0;
    case "manager":
      return 1;
    default:
      return 2;
  }
}

function normalizeSeatSummary(args: {
  seatsIncluded: number | null | undefined;
  seatQuantity: number | null | undefined;
  activeMembers: number;
  pendingInvites: number;
}): BusinessSeatSummary {
  const seatsIncluded = Math.max(1, Math.trunc(args.seatsIncluded ?? 1));
  const seatQuantity = Math.max(seatsIncluded, Math.trunc(args.seatQuantity ?? seatsIncluded));
  const purchasedSeats = Math.max(0, seatQuantity - seatsIncluded);
  const activeMembers = Math.max(0, args.activeMembers);
  const pendingInvites = Math.max(0, args.pendingInvites);
  const usedSeats = activeMembers;
  const reservedSeats = activeMembers + pendingInvites;
  const availableSeats = Math.max(0, seatQuantity - reservedSeats);

  return {
    seatsIncluded,
    seatQuantity,
    purchasedSeats,
    activeMembers,
    pendingInvites,
    usedSeats,
    reservedSeats,
    availableSeats,
  };
}

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

function buildPermissions(role: BusinessRole): BusinessPermissions {
  const isOwner = role === "owner";
  const isManager = role === "manager";

  return {
    canAccessBusiness: true,
    canManageOperations: true,
    canManageTeam: isOwner || isManager,
    canManageBilling: isOwner,
    canInviteMembers: isOwner || isManager,
    canManageSeats: isOwner,
    canChangeMemberRoles: isOwner || isManager,
    canRemoveMembers: isOwner || isManager,
  };
}

function toContext(args: {
  membership: RawMembership;
  account: RawBusinessAccount;
  seats: BusinessSeatSummary;
}): BusinessContext {
  return {
    businessAccountId: args.account.id,
    membershipId: args.membership.id,
    role: args.membership.role,
    ownerUserId: args.account.owner_user_id,
    accountName: args.account.name,
    subscriptionStatus: args.account.subscription_status || "inactive",
    currentPeriodEnd: args.account.current_period_end ?? null,
    stripeCustomerId: args.account.stripe_customer_id ?? null,
    stripeSubscriptionId: args.account.stripe_subscription_id ?? null,
    stripeSubscriptionItemId: args.account.stripe_subscription_item_id ?? null,
    seats: args.seats,
    permissions: buildPermissions(args.membership.role),
  };
}

function parseAccount(raw: RawMembership): RawBusinessAccount | null {
  const account = raw.business_accounts;
  if (!account) return null;
  if (Array.isArray(account)) return account[0] ?? null;
  return account;
}

async function getSeatUsage(
  businessAccountId: string
): Promise<{ activeMembers: number; pendingInvites: number }> {
  const supabase = await createClient();

  const nowIso = new Date().toISOString();

  const [{ count: activeMembersCount }, { count: pendingInvitesCount }] =
    await Promise.all([
      supabase
        .from("business_memberships")
        .select("id", { count: "exact", head: true })
        .eq("business_account_id", businessAccountId)
        .eq("status", "active"),
      supabase
        .from("business_invites")
        .select("id", { count: "exact", head: true })
        .eq("business_account_id", businessAccountId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", nowIso),
    ]);

  return {
    activeMembers: activeMembersCount ?? 0,
    pendingInvites: pendingInvitesCount ?? 0,
  };
}

export async function getBusinessContextForUser(
  userId: string
): Promise<BusinessContext | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_memberships")
    .select(
      "id, business_account_id, role, status, joined_at, business_accounts!inner(id, owner_user_id, name, subscription_status, current_period_end, stripe_customer_id, stripe_subscription_id, stripe_subscription_item_id, seats_included, seat_quantity)"
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(10);

  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    const message = String((error as { message?: string }).message ?? "").toLowerCase();
    const missingTeamSchema =
      code === "PGRST205" ||
      code === "42P01" ||
      message.includes("business_memberships") ||
      message.includes("business_accounts");
    if (missingTeamSchema) {
      return null;
    }
    throw error;
  }

  const memberships = ((data ?? []) as RawMembership[])
    .filter((row) => row.status === "active")
    .sort((a, b) => {
      const rank = roleRank(a.role) - roleRank(b.role);
      if (rank !== 0) return rank;
      const aTs = new Date(a.joined_at || 0).getTime();
      const bTs = new Date(b.joined_at || 0).getTime();
      return aTs - bTs;
    });

  if (memberships.length === 0) {
    return null;
  }

  const membership = memberships[0];
  const account = parseAccount(membership);
  if (!account) return null;

  const usage = await getSeatUsage(account.id);
  const seats = normalizeSeatSummary({
    seatsIncluded: account.seats_included,
    seatQuantity: account.seat_quantity,
    activeMembers: usage.activeMembers,
    pendingInvites: usage.pendingInvites,
  });

  return toContext({ membership, account, seats });
}

export async function requireBusinessContext(userId: string): Promise<BusinessContext> {
  const context = await getBusinessContextForUser(userId);
  if (!context) {
    const err = new Error("Business membership required");
    (err as { status?: number }).status = 403;
    throw err;
  }

  if (
    !isBusinessSubscriptionActive(context.subscriptionStatus, context.currentPeriodEnd)
  ) {
    const err = new Error("Business subscription required");
    (err as { status?: number }).status = 403;
    throw err;
  }

  return context;
}

export async function requireBusinessOwnerContext(
  userId: string
): Promise<BusinessContext> {
  const context = await requireBusinessContext(userId);
  if (context.role !== "owner") {
    const err = new Error("Owner access required");
    (err as { status?: number }).status = 403;
    throw err;
  }
  return context;
}

export function canReserveAnotherSeat(seats: BusinessSeatSummary): boolean {
  return seats.reservedSeats < seats.seatQuantity;
}

export function hasRole(
  context: BusinessContext,
  roles: ReadonlyArray<BusinessRole>
): boolean {
  return roles.includes(context.role);
}
