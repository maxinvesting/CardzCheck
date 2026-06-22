"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  SUBSCRIPTION_MONTHLY_PRICE,
  BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE,
  formatPrice,
} from "@/lib/pricing";

type TeamContext = {
  role: "owner" | "manager" | "employee";
  seats: {
    seatsIncluded: number;
    seatQuantity: number;
    purchasedSeats: number;
    activeMembers: number;
    pendingInvites: number;
    usedSeats: number;
    reservedSeats: number;
    availableSeats: number;
  };
  permissions: {
    canManageTeam: boolean;
    canManageBilling: boolean;
    canInviteMembers: boolean;
    canManageSeats: boolean;
    canChangeMemberRoles: boolean;
    canRemoveMembers: boolean;
  };
};

type TeamMember = {
  id: string;
  user_id: string;
  role: "owner" | "manager" | "employee";
  status: "active" | "inactive";
  joined_at: string;
  name: string | null;
  email: string | null;
  is_current_user: boolean;
  is_owner: boolean;
};

type TeamInvite = {
  id: string;
  email: string;
  role: "manager" | "employee";
  expires_at: string;
  created_at: string;
};

type TeamPayload = {
  context: TeamContext;
  members: TeamMember[];
  invites: TeamInvite[];
};

const BUSINESS_BASE_PRICE = SUBSCRIPTION_MONTHLY_PRICE;
const EXTRA_SEAT_PRICE = BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TeamManagementSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamPayload | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "employee">("employee");
  const [seatInput, setSeatInput] = useState(1);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/business/team", { cache: "no-store" });
      const data = (await response.json()) as TeamPayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load team");
      }
      setTeam(data);
      setSeatInput(data.context.seats.seatQuantity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const monthlyTotal = useMemo(() => {
    if (!team) return BUSINESS_BASE_PRICE;
    return BUSINESS_BASE_PRICE + team.context.seats.purchasedSeats * EXTRA_SEAT_PRICE;
  }, [team]);
  const canCreateInvite = team
    ? team.context.seats.reservedSeats < team.context.seats.seatQuantity
    : false;

  async function withRefresh(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await loadTeam();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteSubmit(event: FormEvent) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    await withRefresh(async () => {
      const response = await fetch("/api/business/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send invite");
      setInviteEmail("");
      setLatestInviteUrl(data.inviteUrl || null);
      setNotice("Invite created. Share the invite link with your teammate.");
    });
  }

  async function handleRoleChange(memberId: string, role: "manager" | "employee") {
    await withRefresh(async () => {
      const response = await fetch(`/api/business/team/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update role");
      setNotice("Role updated.");
    });
  }

  async function handleRemoveMember(memberId: string) {
    await withRefresh(async () => {
      const response = await fetch(`/api/business/team/members/${memberId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to remove member");
      setNotice("Member removed.");
    });
  }

  async function handleRevokeInvite(inviteId: string) {
    await withRefresh(async () => {
      const response = await fetch(`/api/business/team/invites/${inviteId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to revoke invite");
      setNotice("Invite revoked.");
    });
  }

  async function handleSeatUpdate() {
    await withRefresh(async () => {
      const response = await fetch("/api/business/billing/seats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_quantity: seatInput }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update seats");
      if (typeof data.warning === "string" && data.warning) {
        setNotice(data.warning);
      } else {
        setNotice("Seat count updated.");
      }
    });
  }

  async function openBillingPortal() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/business/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to open billing");
      if (typeof data.url === "string" && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No billing URL returned");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open billing");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-24 rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
        {error || "Team details are unavailable."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              CardzCheck Business
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {formatPrice(BUSINESS_BASE_PRICE)}/month includes {team.context.seats.seatsIncluded} user.
              Extra seats are {formatPrice(EXTRA_SEAT_PRICE)}/month each.
            </p>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatPrice(monthlyTotal)}/month
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">Used seats</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {team.context.seats.usedSeats}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">Available seats</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {team.context.seats.availableSeats}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">Pending invites</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {team.context.seats.pendingInvites}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total seats</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {team.context.seats.seatQuantity}
            </p>
          </div>
        </div>

        {team.context.permissions.canManageSeats && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Seat quantity
            </label>
            <input
              type="number"
              min={1}
              value={seatInput}
              onChange={(event) =>
                setSeatInput(Math.max(1, Number(event.target.value || 1)))
              }
              className="w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            <button
              onClick={handleSeatUpdate}
              disabled={saving || seatInput === team.context.seats.seatQuantity}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Update Seats
            </button>
            {team.context.permissions.canManageBilling && (
              <button
                onClick={openBillingPortal}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Manage Billing
              </button>
            )}
          </div>
        )}
      </div>

      {team.context.permissions.canInviteMembers && (
        <form
          onSubmit={handleInviteSubmit}
          className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
        >
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Invite teammate
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="name@business.com"
              className="min-w-[220px] flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as "manager" | "employee")
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {team.context.role === "owner" && (
                <option value="manager">Manager</option>
              )}
              <option value="employee">Employee</option>
            </select>
            <button
              type="submit"
              disabled={saving || !canCreateInvite}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send Invite
            </button>
          </div>
          {!canCreateInvite && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Team is at seat capacity. Add seats to invite more teammates.
            </p>
          )}
          {latestInviteUrl && (
            <p className="mt-2 break-all text-xs text-blue-700 dark:text-blue-300">
              Invite link: {latestInviteUrl}
            </p>
          )}
        </form>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Team members</p>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {team.members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {member.name || member.email || "Team member"}
                  {member.is_current_user && " (you)"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {member.email || "No email"} · Joined {formatDate(member.joined_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {member.role === "owner" ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Owner
                  </span>
                ) : team.context.permissions.canChangeMemberRoles ? (
                  <select
                    value={member.role}
                    onChange={(event) =>
                      handleRoleChange(
                        member.id,
                        event.target.value as "manager" | "employee"
                      )
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  >
                    {team.context.role === "owner" && (
                      <option value="manager">manager</option>
                    )}
                    <option value="employee">employee</option>
                  </select>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {member.role}
                  </span>
                )}

                {!member.is_owner && team.context.permissions.canRemoveMembers && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={saving}
                    className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Pending invites</p>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {team.invites.length === 0 && (
            <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
              No pending invites.
            </p>
          )}
          {team.invites.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {invite.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {invite.role} · Expires {formatDate(invite.expires_at)}
                </p>
              </div>
              {team.context.permissions.canInviteMembers && (
                <button
                  onClick={() => handleRevokeInvite(invite.id)}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
