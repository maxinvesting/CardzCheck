import { afterEach, describe, expect, it, vi } from "vitest";
import { identifyCardFromImages, safeJson } from "@/lib/identify-card/client";

describe("identify-card client helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("safeJson parses valid JSON responses", async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const parsed = await safeJson<{ ok: boolean }>(res);

    expect(parsed.data).toEqual({ ok: true });
    expect(parsed.rawText).toContain("ok");
  });

  it("safeJson returns null data for non-JSON bodies", async () => {
    const res = new Response("Request Entity Too Large", { status: 413 });
    const parsed = await safeJson(res);

    expect(parsed.data).toBeNull();
    expect(parsed.rawText).toBe("Request Entity Too Large");
  });

  it("uses nested parsed.data.error before raw text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { error: "Nested identify error" }, error: "Outer error" }), {
        status: 400,
      })
    );

    const result = await identifyCardFromImages({ imageUrl: "https://example.com/test.jpg" });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("Nested identify error");
  });

  it("falls back to a short raw text snippet when JSON parsing fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Request Entity Too Large - upstream gateway rejected payload", {
        status: 413,
      })
    );

    const result = await identifyCardFromImages({ imageUrl: "https://example.com/test.jpg" });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("Request Entity Too Large");
    expect((result.errorMessage || "").length).toBeLessThanOrEqual(160);
  });
});
