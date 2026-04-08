import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireBusinessContextMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/business/context", () => ({
  requireBusinessContext: requireBusinessContextMock,
  hasRole: (context: { role?: string }, roles: string[]) =>
    roles.includes(context.role || ""),
}));

function buildSupabaseMock() {
  const insertedPayloads: Record<string, unknown>[] = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  /** Set to a Supabase-style error to simulate insert failure (used by tests). */
  const nextInsertError = { current: null as { code: string; message: string; details?: string } | null };
  /** When true, inventory lookup returns null (inventory item not found). */
  let inventoryNotFound = false;

  const from = vi.fn((table: string) => {
    const state: {
      insertedPayload?: Record<string, unknown>;
      updatePayload?: Record<string, unknown>;
    } = {};

    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === "collection_items") {
          if (inventoryNotFound) return { data: null, error: null };
          return {
            data: {
              id: "inv-1",
              title: "Test Card",
              channel: "ebay",
              cost_basis_total_cents: 12000,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        state.insertedPayload = payload;
        insertedPayloads.push(payload);
        return builder;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        state.updatePayload = payload;
        updates.push({ table, payload });
        return builder;
      }),
      single: vi.fn(async () => {
        if (table === "business_sales") {
          const err = nextInsertError.current;
          if (err) {
            nextInsertError.current = null;
            return { data: null, error: err };
          }
          const payload = state.insertedPayload || {};
          return {
            data: {
              id: "sale-1",
              ...payload,
              created_at: "2026-02-26T00:00:00.000Z",
              updated_at: "2026-02-26T00:00:00.000Z",
              inventory_item: { id: "inv-1", title: "Test Card" },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
    };

    return builder;
  });

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from,
    nextInsertError,
    setInventoryNotFound: (v: boolean) => {
      inventoryNotFound = v;
    },
  };

  return {
    client,
    insertedPayloads,
    updates,
  };
}

async function callPost(request: Request) {
  const mod = await import("@/app/api/business/sales/route");
  return mod.POST(request as any);
}

describe("POST /api/business/sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireBusinessContextMock.mockResolvedValue({
      businessAccountId: "acct-1",
      ownerUserId: "user-1",
      role: "owner",
      subscriptionStatus: "active",
      currentPeriodEnd: null,
      seats: {
        seatsIncluded: 1,
        seatQuantity: 1,
        purchasedSeats: 0,
        activeMembers: 1,
        pendingInvites: 0,
        usedSeats: 1,
        reservedSeats: 1,
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
    });
  });

  it("validates required fields", async () => {
    const { client } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({ channel: "ebay" }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid payload");
  });

  it("computes net payout/profit and defaults cogs from inventory item", async () => {
    const { client, insertedPayloads, updates } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sold_price_cents: 20000,
          shipping_charged_cents: 500,
          platform_fees_cents: 2500,
          shipping_cost_cents: 800,
          tax_cents: 200,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(201);

    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0]).toMatchObject({
      user_id: "user-1",
      business_id: "user-1",
      business_account_id: "acct-1",
      inventory_item_id: "inv-1",
      sold_price_cents: 20000,
      net_payout_cents: 17000,
      cogs_cents: 12000,
      profit_cents: 5000,
    });

    expect(updates).toContainEqual(
      expect.objectContaining({
        table: "collection_items",
        payload: expect.objectContaining({
          status: "sold",
        }),
      })
    );

    const body = await response.json();
    expect(body.net_payout_cents).toBe(17000);
    expect(body.profit_cents).toBe(5000);
    expect(body.gross_revenue_cents).toBe(20500);
  });

  it("accepts legacy sale field aliases from older callers", async () => {
    const { client, insertedPayloads } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sale_price_cents: 15000,
          sale_date: "2026-03-21",
          channel: "show",
          shipping_paid_cents: 400,
          other_costs_cents: 100,
          net_proceeds_cents: 14500,
          order_id: "order-123",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(201);
    expect(insertedPayloads[0]).toMatchObject({
      sold_price_cents: 15000,
      sold_at: "2026-03-21T00:00:00.000Z",
      channel: "show",
      shipping_cost_cents: 400,
      tax_cents: 100,
      net_payout_cents: 14500,
      external_order_id: "order-123",
    });
  });

  it("falls back to legacy business_sales schema when upgraded columns are missing", async () => {
    const { client, insertedPayloads } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);
    client.nextInsertError.current = {
      code: "42703",
      message: 'column "business_id" of relation "business_sales" does not exist',
    };

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sold_price_cents: 15000,
          shipping_charged_cents: 500,
          platform_fees_cents: 1200,
          shipping_cost_cents: 400,
          tax_cents: 100,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(201);
    expect(insertedPayloads).toHaveLength(2);
    expect(insertedPayloads[0]).toHaveProperty("business_id");
    expect(insertedPayloads[1]).toMatchObject({
      sale_price_cents: 15000,
      sale_date: expect.any(String),
      shipping_paid_cents: 400,
      other_costs_cents: 100,
    });
    expect(insertedPayloads[1]).not.toHaveProperty("business_id");
  });

  it("returns 403 when user has no business subscription", async () => {
    const error = new Error("Business subscription required");
    (error as { status?: number }).status = 403;
    requireBusinessContextMock.mockRejectedValue(error);
    const { client } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          sold_price_cents: 15000,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Business subscription required");
  });

  it("returns 400 when inventory item is not found for this business", async () => {
    const { client } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);
    client.setInventoryNotFound(true);

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sold_price_cents: 15000,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Inventory item not found for this business");
  });

  it("returns 400 with clear message when external order ID is duplicate (23505)", async () => {
    const { client } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);
    client.nextInsertError.current = {
      code: "23505",
      message: "duplicate key value violates unique constraint idx_business_sales_business_external_order",
      details: "Key (business_id, external_order_id)=(...) already exists.",
    };

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sold_price_cents: 15000,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("External order ID is already used");
  });

  it("returns 403 with clear message on RLS/permission error (42501)", async () => {
    const { client } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);
    client.nextInsertError.current = {
      code: "42501",
      message: "permission denied for table business_sales",
    };

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sold_price_cents: 15000,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("permission");
  });

  it("returns 400 with clear message on inventory FK mismatch (23503)", async () => {
    const { client } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);
    client.nextInsertError.current = {
      code: "23503",
      message:
        'insert or update on table "business_sales" violates foreign key constraint "business_sales_inventory_item_id_fkey"',
      details: "Key (inventory_item_id)=(inv-1) is not present in table \"collection_items\".",
    };

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sold_price_cents: 15000,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Inventory item link is invalid");
  });

  it("returns 500 and generic message for unmapped DB errors", async () => {
    const { client } = buildSupabaseMock();
    createClientMock.mockResolvedValue(client);
    client.nextInsertError.current = {
      code: "22P02",
      message: "invalid input syntax for type uuid",
    };

    const response = await callPost(
      new Request("http://localhost/api/business/sales", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: "11111111-1111-1111-1111-111111111111",
          sold_price_cents: 15000,
          channel: "ebay",
        }),
        headers: { "Content-Type": "application/json" },
      }) as any
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to create sale");
  });
});
