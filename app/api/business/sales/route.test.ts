import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const hasBusinessAccessMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/access", () => ({
  hasBusinessAccess: hasBusinessAccessMock,
}));

function buildSupabaseMock() {
  const insertedPayloads: Record<string, unknown>[] = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];

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
        if (table === "business_inventory_items") {
          return {
            data: {
              id: "inv-1",
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

  return {
    client: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
      from,
    },
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
    hasBusinessAccessMock.mockResolvedValue(true);
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
      inventory_item_id: "inv-1",
      sold_price_cents: 20000,
      net_payout_cents: 17000,
      cogs_cents: 12000,
      profit_cents: 5000,
    });

    expect(updates.some((entry) => entry.table === "business_inventory_items")).toBe(true);

    const body = await response.json();
    expect(body.net_payout_cents).toBe(17000);
    expect(body.profit_cents).toBe(5000);
    expect(body.gross_revenue_cents).toBe(20500);
  });
});
