import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createServiceClientMock = vi.fn();
const requireBusinessContextMock = vi.fn();
const requireBusinessOwnerContextMock = vi.fn();
const isTestModeMock = vi.fn(() => false);

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
  createServiceClient: createServiceClientMock,
}));

vi.mock("@/lib/business/context", () => ({
  requireBusinessContext: requireBusinessContextMock,
  requireBusinessOwnerContext: requireBusinessOwnerContextMock,
}));

vi.mock("@/lib/test-mode", () => ({
  isTestMode: isTestModeMock,
}));

function buildAuthClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
  };
}

function buildServiceClient(row: Record<string, unknown>) {
  let updatedPayload: Record<string, unknown> | null = null;

  const from = vi.fn((_table: string) => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatedPayload = payload;
        return builder;
      }),
      single: vi.fn(async () => ({
        data: row,
        error: null,
      })),
    };

    return builder;
  });

  return {
    client: { from },
    getUpdatedPayload: () => updatedPayload,
  };
}

async function callGet() {
  const mod = await import("@/app/api/business/appearance/route");
  return mod.GET();
}

async function callPatch(body: unknown) {
  const mod = await import("@/app/api/business/appearance/route");
  return mod.PATCH(
    new Request("http://localhost/api/business/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as any
  );
}

describe("business appearance API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isTestModeMock.mockReturnValue(false);
    requireBusinessContextMock.mockResolvedValue({
      businessAccountId: "acct-1",
      role: "manager",
    });
    requireBusinessOwnerContextMock.mockResolvedValue({
      businessAccountId: "acct-1",
      role: "owner",
    });
  });

  it("returns the workspace palette for an active business member", async () => {
    createClientMock.mockResolvedValue(buildAuthClient());
    createServiceClientMock.mockResolvedValue(
      buildServiceClient({
        appearance_primary_color: "#1D9E75",
        appearance_secondary_color: "#15803D",
        appearance_tertiary_color: "#0F766E",
      }).client
    );

    const response = await callGet();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      primaryColor: "#1D9E75",
      secondaryColor: "#15803D",
      tertiaryColor: "#0F766E",
      canEdit: false,
    });
    expect(requireBusinessContextMock).toHaveBeenCalledWith("user-1");
  });

  it("allows the workspace owner to update the palette", async () => {
    const service = buildServiceClient({
      appearance_primary_color: "#228B5A",
      appearance_secondary_color: "#1F7A45",
      appearance_tertiary_color: "#126E82",
    });

    createClientMock.mockResolvedValue(buildAuthClient());
    createServiceClientMock.mockResolvedValue(service.client);

    const response = await callPatch({
      primaryColor: "#228b5a",
      secondaryColor: "#1f7a45",
      tertiaryColor: "#126e82",
    });

    expect(response.status).toBe(200);
    expect(service.getUpdatedPayload()).toEqual({
      appearance_primary_color: "#228B5A",
      appearance_secondary_color: "#1F7A45",
      appearance_tertiary_color: "#126E82",
    });

    const body = await response.json();
    expect(body).toEqual({
      primaryColor: "#228B5A",
      secondaryColor: "#1F7A45",
      tertiaryColor: "#126E82",
      canEdit: true,
    });
    expect(requireBusinessOwnerContextMock).toHaveBeenCalledWith("user-1");
  });

  it("rejects non-owner palette updates", async () => {
    const error = Object.assign(new Error("Owner access required"), {
      status: 403,
    });

    createClientMock.mockResolvedValue(buildAuthClient());
    requireBusinessOwnerContextMock.mockRejectedValue(error);

    const response = await callPatch({
      primaryColor: "#228B5A",
      secondaryColor: "#1F7A45",
      tertiaryColor: "#126E82",
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Owner access required");
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid hex values", async () => {
    createClientMock.mockResolvedValue(buildAuthClient());

    const response = await callPatch({
      primaryColor: "#228B5A",
      secondaryColor: "green",
      tertiaryColor: "#126E82",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe(
      "primaryColor, secondaryColor, and tertiaryColor must be valid #RRGGBB values"
    );
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });
});
