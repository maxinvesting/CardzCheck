import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
}));

const supabaseMock = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/supabase", () => supabaseMock);

import { POST as addCompPost } from "@/app/api/admin/add-comp/route";
import { POST as createSkuPost } from "@/app/api/admin/create-sku/route";
import { POST as logPegUpdatePost } from "@/app/api/admin/log-peg-update/route";

function forbiddenResponse() {
  return Response.json({ error: "Admin access required" }, { status: 403 });
}

function adminUser() {
  return {
    ok: true as const,
    user: {
      userId: "admin-user-id",
      email: "admin@example.com",
      role: "admin" as const,
      walletAddress: null,
    },
  };
}

function buildInsertClient(result: unknown) {
  const single = vi.fn().mockResolvedValue({ data: result, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return {
    client: { from },
    from,
    insert,
    select,
    single,
  };
}

describe("admin API route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin create-sku requests", async () => {
    authMock.requireAdminUser.mockResolvedValue({ ok: false, response: forbiddenResponse() });

    const response = await createSkuPost(
      new Request("http://localhost/api/admin/create-sku", {
        method: "POST",
        body: JSON.stringify({ name: "Test card" }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access required" });
    expect(supabaseMock.getAdminSupabase).not.toHaveBeenCalled();
  });

  it("allows admins to create a listing sku", async () => {
    authMock.requireAdminUser.mockResolvedValue(adminUser());

    const insertClient = buildInsertClient({
      id: "sku-row-id",
      sku_id: "0x1c7385eddbf8f67a96af0ca5ab4adf4e4f8cdaf0130f33b845ca9cf3f70aee3f",
      name: "2018 Topps Shohei Ohtani PSA 10",
      image_url: "https://example.com/card.png",
      details: {},
      status: "active",
      card_year: "2018",
      set_name: "Topps Update",
      player_name: "Shohei Ohtani",
      card_number: "US1",
      parallel: null,
      grade: "PSA 10",
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    supabaseMock.getAdminSupabase.mockReturnValue(insertClient.client);

    const response = await createSkuPost(
      new Request("http://localhost/api/admin/create-sku", {
        method: "POST",
        body: JSON.stringify({
          name: "2018 Topps Shohei Ohtani PSA 10",
          imageUrl: "https://example.com/card.png",
          year: "2018",
          set: "Topps Update",
          player: "Shohei Ohtani",
          cardNo: "US1",
          grade: "PSA 10",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(supabaseMock.getAdminSupabase).toHaveBeenCalledTimes(1);
    expect(insertClient.from).toHaveBeenCalledWith("skus");
    expect(insertClient.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects non-admin add-comp requests", async () => {
    authMock.requireAdminUser.mockResolvedValue({ ok: false, response: forbiddenResponse() });

    const response = await addCompPost(
      new Request("http://localhost/api/admin/add-comp", {
        method: "POST",
        body: JSON.stringify({ skuId: "0x0", priceCents: "1", soldAt: new Date().toISOString() }),
      })
    );

    expect(response.status).toBe(403);
    expect(supabaseMock.getAdminSupabase).not.toHaveBeenCalled();
  });

  it("allows admins to save sold comps", async () => {
    authMock.requireAdminUser.mockResolvedValue(adminUser());

    const insertClient = buildInsertClient({
      id: "comp-id",
      sku_id: "0x8a9a56c5a1e5dcd44bd50d07dca3e7ec9023c6d31ae5d64865ce42928de0b923",
      price_cents: "42500000",
      sold_at: "2026-03-09T12:00:00.000Z",
      source: "ebay_sold",
      external_id: "itm-1",
    });
    supabaseMock.getAdminSupabase.mockReturnValue(insertClient.client);

    const response = await addCompPost(
      new Request("http://localhost/api/admin/add-comp", {
        method: "POST",
        body: JSON.stringify({
          skuId: "0x8a9a56c5a1e5dcd44bd50d07dca3e7ec9023c6d31ae5d64865ce42928de0b923",
          priceCents: "42500000",
          soldAt: "2026-03-09T12:00:00.000Z",
          source: "ebay_sold",
          externalId: "itm-1",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(insertClient.from).toHaveBeenCalledWith("sold_comps");
    expect(insertClient.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects non-admin log-peg-update requests", async () => {
    authMock.requireAdminUser.mockResolvedValue({ ok: false, response: forbiddenResponse() });

    const response = await logPegUpdatePost(
      new Request("http://localhost/api/admin/log-peg-update", {
        method: "POST",
        body: JSON.stringify({ skuId: "0x0" }),
      })
    );

    expect(response.status).toBe(403);
    expect(supabaseMock.getAdminSupabase).not.toHaveBeenCalled();
  });

  it("allows admins to log peg updates", async () => {
    authMock.requireAdminUser.mockResolvedValue(adminUser());

    const insertClient = buildInsertClient({
      id: "peg-id",
      sku_id: "0x8a9a56c5a1e5dcd44bd50d07dca3e7ec9023c6d31ae5d64865ce42928de0b923",
      peg_price: "42500000",
      observed_at: "2026-03-09T12:05:00.000Z",
      nonce: "4",
      tx_hash: "0xabc",
    });
    supabaseMock.getAdminSupabase.mockReturnValue(insertClient.client);

    const response = await logPegUpdatePost(
      new Request("http://localhost/api/admin/log-peg-update", {
        method: "POST",
        body: JSON.stringify({
          skuId: "0x8a9a56c5a1e5dcd44bd50d07dca3e7ec9023c6d31ae5d64865ce42928de0b923",
          pegPrice: "42500000",
          method: 1,
          n: 5,
          windowSeconds: 2_592_000,
          salesHash: "0xe72b6fe967603db36cd91f7fd80bc3b4c85dfb111f0fc4f4fd07161f772ab004",
          observedAt: "2026-03-09T12:05:00.000Z",
          nonce: "4",
          txHash: "0xabc",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(insertClient.from).toHaveBeenCalledWith("peg_updates");
    expect(insertClient.insert).toHaveBeenCalledTimes(1);
  });
});
