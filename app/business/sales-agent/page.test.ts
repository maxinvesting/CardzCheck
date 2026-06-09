import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("/business/sales-agent page", () => {
  it("redirects legacy Sales Agent traffic to the Messages inbox", async () => {
    const mod = await import("@/app/business/sales-agent/page");

    mod.default();

    expect(redirectMock).toHaveBeenCalledWith("/business/messages");
  });
});
