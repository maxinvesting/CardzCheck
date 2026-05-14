import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("/business/messages page", () => {
  it("redirects legacy traffic to the canonical sales route", async () => {
    const mod = await import("@/app/business/messages/page");

    mod.default();

    expect(redirectMock).toHaveBeenCalledWith("/business/sales-agent");
  });
});
