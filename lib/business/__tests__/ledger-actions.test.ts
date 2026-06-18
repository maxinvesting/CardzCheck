import { describe, expect, it } from "vitest";
import {
  undoLedgerAction,
  type BusinessLedgerAction,
} from "@/lib/business/ledger-actions";
import type { BusinessContext } from "@/types";

function buildContext(): BusinessContext {
  return {
    businessAccountId: "acct-1",
    membershipId: "membership-1",
    role: "owner",
    ownerUserId: "user-1",
    accountName: null,
    subscriptionStatus: "active",
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeSubscriptionItemId: null,
    seats: {
      seatsIncluded: 1,
      seatQuantity: 1,
      purchasedSeats: 0,
      activeMembers: 1,
      pendingInvites: 0,
      usedSeats: 1,
      reservedSeats: 0,
      availableSeats: 0,
    },
    permissions: {
      canAccessBusiness: true,
      canManageOperations: true,
      canManageTeam: true,
      canManageBilling: true,
      canInviteMembers: true,
      canManageSeats: true,
      canChangeMemberRoles: true,
      canRemoveMembers: true,
    },
  };
}

function buildAction(
  action: Partial<BusinessLedgerAction>
): BusinessLedgerAction {
  return {
    id: "action-1",
    user_id: "user-1",
    business_account_id: "acct-1",
    action_type: "inventory_update",
    label: "edit card",
    payload: {},
    is_undone: false,
    created_at: "2026-06-05T00:00:00.000Z",
    ...action,
  };
}

function buildSupabaseMock() {
  const calls: Array<{
    table: string;
    op: string;
    payload?: unknown;
    filters: Array<[string, unknown]>;
  }> = [];

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const builder: any = {
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      in: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      update: (payload: unknown) => {
        calls.push({ table, op: "update", payload, filters });
        return builder;
      },
      delete: () => {
        calls.push({ table, op: "delete", filters });
        return builder;
      },
      upsert: (payload: unknown) => {
        calls.push({ table, op: "upsert", payload, filters });
        return builder;
      },
    };
    return builder;
  };

  return {
    supabase: { from },
    calls,
  };
}

describe("ledger action undo", () => {
  it("restores deleted inventory rows and cascaded card images", async () => {
    const { supabase, calls } = buildSupabaseMock();

    await undoLedgerAction({
      supabase,
      userId: "user-1",
      context: buildContext(),
      action: buildAction({
        action_type: "inventory_delete",
        label: "delete card",
        payload: {
          beforeRows: [
            {
              id: "item-1",
              user_id: "user-1",
              item_kind: "inventory",
              title: "Test Card",
            },
          ],
          cardImageRows: [
            {
              id: "image-1",
              card_id: "item-1",
              user_id: "user-1",
              storage_path: "cards/item-1/front.jpg",
              position: 0,
              label: "front",
            },
          ],
        },
      }),
    });

    expect(calls).toEqual([
      expect.objectContaining({
        table: "collection_items",
        op: "upsert",
      }),
      expect.objectContaining({
        table: "card_images",
        op: "upsert",
      }),
      expect.objectContaining({
        table: "business_ledger_actions",
        op: "update",
        payload: expect.objectContaining({ is_undone: true }),
      }),
    ]);
  });

  it("undoes a sale by soft-deleting the sale and restoring inventory state", async () => {
    const { supabase, calls } = buildSupabaseMock();

    await undoLedgerAction({
      supabase,
      userId: "user-1",
      context: buildContext(),
      action: buildAction({
        action_type: "sale_create",
        label: "record sale",
        payload: {
          saleId: "sale-1",
          inventoryBeforeRows: [
            {
              id: "item-1",
              user_id: "user-1",
              item_kind: "inventory",
              status: "listed",
              quantity: 3,
              cost_basis_total_cents: 9000,
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-02T00:00:00.000Z",
            },
          ],
        },
      }),
    });

    expect(calls[0]).toMatchObject({
      table: "business_sales",
      op: "update",
      payload: expect.objectContaining({ is_deleted: true }),
    });
    // The sale's cash on hand impact is reversed (soft-deleted) by source.
    expect(calls[1]).toMatchObject({
      table: "business_cash_transactions",
      op: "update",
      payload: expect.objectContaining({ is_deleted: true }),
      filters: expect.arrayContaining([
        ["source_type", "sale"],
        ["source_id", "sale-1"],
      ]),
    });
    expect(calls[2]).toMatchObject({
      table: "collection_items",
      op: "update",
      payload: expect.objectContaining({
        status: "listed",
        quantity: 3,
        cost_basis_total_cents: 9000,
      }),
    });
    expect(calls[2].payload).not.toHaveProperty("id");
    expect(calls[2].payload).not.toHaveProperty("created_at");
  });
});
