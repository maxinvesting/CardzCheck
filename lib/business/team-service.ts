import { randomBytes, createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import {
  requireBusinessContext,
  requireBusinessOwnerContext,
  type BusinessContext,
  type BusinessRole,
} from "@/lib/business/context";

type MemberRow = {
  id: string;
  user_id: string;
  role: BusinessRole;
  status: "active" | "inactive";
  joined_at: string;
  created_at: string;
};

type InviteRow = {
  id: string;
  business_account_id: string;
  email: string;
  email_normalized: string;
  role: Exclude<BusinessRole, "owner">;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  created_at: string;
};

type AccountSeatRow = {
  id: string;
  seats_included: number | null;
  seat_quantity: number | null;
};

type SeatUsage = {
  activeMembers: number;
  pendingInvites: number;
  seatQuantity: number;
  seatsIncluded: number;
  purchasedSeats: number;
  usedSeats: number;
  reservedSeats: number;
  availableSeats: number;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

function requirePermission(
  condition: boolean,
  message: string,
  status = 403
): void {
  if (!condition) {
    const err = new Error(message);
    (err as { status?: number }).status = status;
    throw err;
  }
}

async function getSeatUsageForAccount(
  businessAccountId: string,
  defaultSeatQuantity: number,
  defaultSeatsIncluded = 1
): Promise<SeatUsage> {
  const service = await createServiceClient();
  const nowIso = new Date().toISOString();

  const [{ count: activeMembers }, { count: pendingInvites }] = await Promise.all([
    service
      .from("business_memberships")
      .select("id", { count: "exact", head: true })
      .eq("business_account_id", businessAccountId)
      .eq("status", "active"),
    service
      .from("business_invites")
      .select("id", { count: "exact", head: true })
      .eq("business_account_id", businessAccountId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso),
  ]);

  const seatsIncluded = Math.max(1, Math.trunc(defaultSeatsIncluded));
  const seatQuantity = Math.max(seatsIncluded, Math.trunc(defaultSeatQuantity));
  const usedSeats = activeMembers ?? 0;
  const pending = pendingInvites ?? 0;
  const reservedSeats = usedSeats + pending;

  return {
    activeMembers: usedSeats,
    pendingInvites: pending,
    seatQuantity,
    seatsIncluded,
    purchasedSeats: Math.max(0, seatQuantity - seatsIncluded),
    usedSeats,
    reservedSeats,
    availableSeats: Math.max(0, seatQuantity - reservedSeats),
  };
}

async function getAccountSeatRow(businessAccountId: string): Promise<AccountSeatRow> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("business_accounts")
    .select("id, seats_included, seat_quantity")
    .eq("id", businessAccountId)
    .single();

  if (error || !data) {
    const err = new Error("Business account not found");
    (err as { status?: number }).status = 404;
    throw err;
  }

  return data as AccountSeatRow;
}

export async function getBusinessTeamDashboard(userId: string) {
  const context = await requireBusinessContext(userId);
  const service = await createServiceClient();

  const [membersRes, invitesRes, seatUsage] = await Promise.all([
    service
      .from("business_memberships")
      .select("id, user_id, role, status, joined_at, created_at")
      .eq("business_account_id", context.businessAccountId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    service
      .from("business_invites")
      .select(
        "id, business_account_id, email, email_normalized, role, expires_at, accepted_at, revoked_at, invited_by, created_at"
      )
      .eq("business_account_id", context.businessAccountId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    getSeatUsageForAccount(
      context.businessAccountId,
      context.seats.seatQuantity,
      context.seats.seatsIncluded
    ),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (invitesRes.error) throw invitesRes.error;

  const members = (membersRes.data ?? []) as MemberRow[];
  const invites = (invitesRes.data ?? []) as InviteRow[];

  const memberUserIds = Array.from(new Set(members.map((m) => m.user_id)));
  const { data: usersData } =
    memberUserIds.length > 0
      ? await service
          .from("users")
          .select("id, email, name")
          .in("id", memberUserIds)
      : { data: [] as Array<{ id: string; email: string | null; name: string | null }> };

  const userById = new Map<string, { email: string | null; name: string | null }>();
  for (const row of usersData ?? []) {
    userById.set(row.id, { email: row.email ?? null, name: row.name ?? null });
  }

  const mappedMembers = members
    .sort((a, b) => roleRank(a.role) - roleRank(b.role))
    .map((member) => ({
      id: member.id,
      user_id: member.user_id,
      role: member.role,
      status: member.status,
      joined_at: member.joined_at,
      name: userById.get(member.user_id)?.name ?? null,
      email: userById.get(member.user_id)?.email ?? null,
      is_current_user: member.user_id === userId,
      is_owner: member.role === "owner",
    }));

  const mappedInvites = invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expires_at: invite.expires_at,
    invited_by: invite.invited_by,
    created_at: invite.created_at,
  }));

  return {
    context: {
      businessAccountId: context.businessAccountId,
      role: context.role,
      accountName: context.accountName,
      subscriptionStatus: context.subscriptionStatus,
      seats: seatUsage,
      permissions: context.permissions,
    },
    members: mappedMembers,
    invites: mappedInvites,
  };
}

export async function createBusinessInvite(args: {
  actorUserId: string;
  email: string;
  role: Exclude<BusinessRole, "owner">;
}) {
  const { actorUserId, role } = args;
  const context = await requireBusinessContext(actorUserId);
  const service = await createServiceClient();
  const email = normalizeEmail(args.email || "");
  const nowIso = new Date().toISOString();

  requirePermission(Boolean(email), "Invite email is required", 400);
  requirePermission(
    context.permissions.canInviteMembers,
    "Only owners or managers can invite teammates"
  );

  if (context.role === "manager") {
    requirePermission(
      role === "employee",
      "Managers can only invite employees"
    );
  }

  const accountSeat = await getAccountSeatRow(context.businessAccountId);
  const seats = await getSeatUsageForAccount(
    context.businessAccountId,
    accountSeat.seat_quantity ?? context.seats.seatQuantity,
    accountSeat.seats_included ?? context.seats.seatsIncluded
  );

  requirePermission(
    seats.reservedSeats < seats.seatQuantity,
    "No available seats. Add seats before inviting teammates.",
    409
  );

  // Expire stale invites for this email so users can be re-invited cleanly.
  await service
    .from("business_invites")
    .update({ revoked_at: nowIso })
    .eq("business_account_id", context.businessAccountId)
    .eq("email_normalized", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lte("expires_at", nowIso);

  const { data: existingInvite } = await service
    .from("business_invites")
    .select("id")
    .eq("business_account_id", context.businessAccountId)
    .eq("email_normalized", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();

  requirePermission(!existingInvite, "An active invite already exists for this email", 409);

  const { data: userMatch } = await service
    .from("users")
    .select("id, email")
    .ilike("email", email)
    .limit(1);

  const matchedUserId = userMatch?.[0]?.id ?? null;
  if (matchedUserId) {
    const { data: existingMembership } = await service
      .from("business_memberships")
      .select("id")
      .eq("business_account_id", context.businessAccountId)
      .eq("user_id", matchedUserId)
      .eq("status", "active")
      .maybeSingle();

    requirePermission(!existingMembership, "User is already a team member", 409);
  }

  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error } = await service
    .from("business_invites")
    .insert({
      business_account_id: context.businessAccountId,
      email,
      email_normalized: email,
      role,
      token_hash: tokenHash,
      invited_by: actorUserId,
      expires_at: expiresAt,
    })
    .select(
      "id, business_account_id, email, email_normalized, role, expires_at, accepted_at, revoked_at, invited_by, created_at"
    )
    .single();

  if (error) {
    if (String(error.code || "") === "23505") {
      const err = new Error("An active invite already exists for this email");
      (err as { status?: number }).status = 409;
      throw err;
    }
    throw error;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/business/invite?token=${rawToken}`;

  return {
    invite: invite as InviteRow,
    inviteUrl,
    seats,
  };
}

export async function acceptBusinessInvite(args: {
  userId: string;
  userEmail: string | null | undefined;
  token: string;
}) {
  const token = (args.token || "").trim();
  requirePermission(token.length >= 16, "Invalid invite token", 400);
  requirePermission(Boolean(args.userEmail), "Email required to accept invite", 400);

  const service = await createServiceClient();
  const tokenHash = hashInviteToken(token);
  const normalizedEmail = normalizeEmail(args.userEmail || "");

  const { data: invite, error } = await service
    .from("business_invites")
    .select(
      "id, business_account_id, email, email_normalized, role, expires_at, accepted_at, revoked_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  requirePermission(Boolean(invite), "Invite not found", 404);

  const inviteRow = invite as {
    id: string;
    business_account_id: string;
    email_normalized: string;
    role: Exclude<BusinessRole, "owner">;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  };

  requirePermission(!inviteRow.accepted_at, "Invite already accepted", 409);
  requirePermission(!inviteRow.revoked_at, "Invite is no longer active", 409);
  requirePermission(
    new Date(inviteRow.expires_at).getTime() > Date.now(),
    "Invite has expired",
    410
  );
  requirePermission(
    inviteRow.email_normalized === normalizedEmail,
    "Invite email does not match your account email",
    403
  );

  const accountSeat = await getAccountSeatRow(inviteRow.business_account_id);
  const seats = await getSeatUsageForAccount(
    inviteRow.business_account_id,
    accountSeat.seat_quantity ?? 1,
    accountSeat.seats_included ?? 1
  );
  requirePermission(
    seats.activeMembers < seats.seatQuantity,
    "Team is out of seats. Contact the owner to add seats.",
    409
  );

  const { data: existingMembership } = await service
    .from("business_memberships")
    .select("id, status")
    .eq("business_account_id", inviteRow.business_account_id)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (existingMembership) {
    const { error: updateMembershipError } = await service
      .from("business_memberships")
      .update({
        status: "active",
        role: inviteRow.role,
        joined_at: new Date().toISOString(),
      })
      .eq("id", existingMembership.id);
    if (updateMembershipError) throw updateMembershipError;
  } else {
    const { error: insertMembershipError } = await service
      .from("business_memberships")
      .insert({
        business_account_id: inviteRow.business_account_id,
        user_id: args.userId,
        role: inviteRow.role,
        status: "active",
        joined_at: new Date().toISOString(),
      });
    if (insertMembershipError) throw insertMembershipError;
  }

  const { error: markAcceptedError } = await service
    .from("business_invites")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: args.userId,
    })
    .eq("id", inviteRow.id);
  if (markAcceptedError) throw markAcceptedError;

  return { businessAccountId: inviteRow.business_account_id };
}

export async function revokeBusinessInvite(args: {
  actorUserId: string;
  inviteId: string;
}) {
  const context = await requireBusinessContext(args.actorUserId);
  requirePermission(
    context.permissions.canInviteMembers,
    "Only owners or managers can revoke invites"
  );

  const service = await createServiceClient();
  const { data: invite, error } = await service
    .from("business_invites")
    .select("id, business_account_id, role, accepted_at, revoked_at")
    .eq("id", args.inviteId)
    .maybeSingle();
  if (error) throw error;
  requirePermission(Boolean(invite), "Invite not found", 404);

  const inviteRow = invite as {
    id: string;
    business_account_id: string;
    role: Exclude<BusinessRole, "owner">;
    accepted_at: string | null;
    revoked_at: string | null;
  };

  requirePermission(
    inviteRow.business_account_id === context.businessAccountId,
    "Invite not found",
    404
  );
  requirePermission(!inviteRow.accepted_at, "Cannot revoke an accepted invite", 409);
  requirePermission(!inviteRow.revoked_at, "Invite already revoked", 409);

  if (context.role === "manager") {
    requirePermission(
      inviteRow.role === "employee",
      "Managers can only manage employee invites"
    );
  }

  const { error: revokeError } = await service
    .from("business_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteRow.id);
  if (revokeError) throw revokeError;
}

export async function updateBusinessMemberRole(args: {
  actorUserId: string;
  membershipId: string;
  role: Exclude<BusinessRole, "owner">;
}) {
  const context = await requireBusinessContext(args.actorUserId);
  requirePermission(
    context.permissions.canChangeMemberRoles,
    "Only owners or managers can change roles"
  );

  const service = await createServiceClient();
  const { data: membership, error } = await service
    .from("business_memberships")
    .select("id, business_account_id, role, user_id, status")
    .eq("id", args.membershipId)
    .maybeSingle();
  if (error) throw error;
  requirePermission(Boolean(membership), "Member not found", 404);

  const target = membership as {
    id: string;
    business_account_id: string;
    role: BusinessRole;
    user_id: string;
    status: "active" | "inactive";
  };

  requirePermission(
    target.business_account_id === context.businessAccountId,
    "Member not found",
    404
  );
  requirePermission(target.status === "active", "Member is not active", 409);
  requirePermission(target.role !== "owner", "Owner role cannot be reassigned");
  if (context.role === "manager") {
    requirePermission(
      target.role === "employee" && args.role === "employee",
      "Managers can only manage employees"
    );
  }

  const { error: updateError } = await service
    .from("business_memberships")
    .update({ role: args.role })
    .eq("id", target.id);
  if (updateError) throw updateError;
}

export async function removeBusinessMember(args: {
  actorUserId: string;
  membershipId: string;
}) {
  const context = await requireBusinessContext(args.actorUserId);
  requirePermission(
    context.permissions.canRemoveMembers,
    "Only owners or managers can remove members"
  );

  const service = await createServiceClient();
  const { data: membership, error } = await service
    .from("business_memberships")
    .select("id, business_account_id, role, user_id, status")
    .eq("id", args.membershipId)
    .maybeSingle();
  if (error) throw error;
  requirePermission(Boolean(membership), "Member not found", 404);

  const target = membership as {
    id: string;
    business_account_id: string;
    role: BusinessRole;
    user_id: string;
    status: "active" | "inactive";
  };

  requirePermission(
    target.business_account_id === context.businessAccountId,
    "Member not found",
    404
  );
  requirePermission(target.status === "active", "Member is not active", 409);
  requirePermission(target.role !== "owner", "Cannot remove the owner");
  requirePermission(target.user_id !== context.ownerUserId, "Cannot remove the owner");

  if (context.role === "manager") {
    requirePermission(
      target.role === "employee",
      "Managers can only remove employees"
    );
  }

  const { error: updateError } = await service
    .from("business_memberships")
    .update({ status: "inactive" })
    .eq("id", target.id);
  if (updateError) throw updateError;
}

export async function updateBusinessSeats(args: {
  actorUserId: string;
  seatQuantity: number;
}) {
  const context = await requireBusinessOwnerContext(args.actorUserId);
  const service = await createServiceClient();
  const account = await getAccountSeatRow(context.businessAccountId);

  const nextSeatQuantity = Math.max(1, Math.trunc(args.seatQuantity || 1));
  const usage = await getSeatUsageForAccount(
    context.businessAccountId,
    account.seat_quantity ?? context.seats.seatQuantity,
    account.seats_included ?? context.seats.seatsIncluded
  );

  requirePermission(
    nextSeatQuantity >= usage.reservedSeats,
    "Seat count cannot be lower than active members + pending invites",
    400
  );

  // Personal build: billing was removed, so seat counts are app-only state
  // with no Stripe subscription to keep in sync.
  const warning: string | null = null;

  const { error: updateError } = await service
    .from("business_accounts")
    .update({
      seat_quantity: nextSeatQuantity,
    })
    .eq("id", context.businessAccountId);
  if (updateError) throw updateError;

  return {
    seatQuantity: nextSeatQuantity,
    warning,
  };
}


