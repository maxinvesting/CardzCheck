import { describe, it, expect } from "vitest";
import { normalizeEbayStoreUrl, buildEbayStoreHref } from "../ebay-store-url";

describe("normalizeEbayStoreUrl", () => {
  it("returns null for non-string", () => {
    expect(normalizeEbayStoreUrl(null)).toBeNull();
    expect(normalizeEbayStoreUrl(undefined)).toBeNull();
    expect(normalizeEbayStoreUrl(1 as any)).toBeNull();
  });

  it("returns null for empty or whitespace", () => {
    expect(normalizeEbayStoreUrl("")).toBeNull();
    expect(normalizeEbayStoreUrl("   ")).toBeNull();
  });

  it("trims and returns non-empty string", () => {
    expect(normalizeEbayStoreUrl("https://www.ebay.com/str/mystore")).toBe(
      "https://www.ebay.com/str/mystore"
    );
    expect(normalizeEbayStoreUrl("  https://www.ebay.com/str/mystore  ")).toBe(
      "https://www.ebay.com/str/mystore"
    );
  });
});

describe("buildEbayStoreHref", () => {
  it("returns null for null/undefined/empty", () => {
    expect(buildEbayStoreHref(null)).toBeNull();
    expect(buildEbayStoreHref(undefined)).toBeNull();
    expect(buildEbayStoreHref("")).toBeNull();
    expect(buildEbayStoreHref("   ")).toBeNull();
  });

  it("returns same URL when already https", () => {
    const url = "https://www.ebay.com/str/cardzcheckmarketplace";
    expect(buildEbayStoreHref(url)).toBe(url);
  });

  it("returns same URL when already http", () => {
    const url = "http://www.ebay.com/str/mystore";
    expect(buildEbayStoreHref(url)).toBe(url);
  });

  it("prepends https:// when scheme missing", () => {
    expect(buildEbayStoreHref("www.ebay.com/str/mystore")).toBe(
      "https://www.ebay.com/str/mystore"
    );
    expect(buildEbayStoreHref("ebay.com/str/mystore")).toBe(
      "https://ebay.com/str/mystore"
    );
  });

  it("returns null for invalid protocol", () => {
    expect(buildEbayStoreHref("javascript:alert(1)")).toBeNull();
    expect(buildEbayStoreHref("file:///etc/passwd")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(buildEbayStoreHref("not a url")).toBeNull();
  });

  it("trims input before validating", () => {
    expect(buildEbayStoreHref("  https://www.ebay.com/str/mystore  ")).toBe(
      "https://www.ebay.com/str/mystore"
    );
  });
});
