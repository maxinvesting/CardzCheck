import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pickBestResolvedCertImageUrl,
  resolvePsaCertImageFromTcgapis,
} from "@/lib/images/cert-image-resolver";

const ORIGINAL_TCGAPIS_API_KEY = process.env.TCGAPIS_API_KEY;
const ORIGINAL_TCGAPIS_BASE_URL = process.env.TCGAPIS_BASE_URL;

afterEach(() => {
  if (ORIGINAL_TCGAPIS_API_KEY === undefined) {
    delete process.env.TCGAPIS_API_KEY;
  } else {
    process.env.TCGAPIS_API_KEY = ORIGINAL_TCGAPIS_API_KEY;
  }
  if (ORIGINAL_TCGAPIS_BASE_URL === undefined) {
    delete process.env.TCGAPIS_BASE_URL;
  } else {
    process.env.TCGAPIS_BASE_URL = ORIGINAL_TCGAPIS_BASE_URL;
  }
  vi.restoreAllMocks();
});

describe("cert image resolver scoring", () => {
  it("prefers front slab images over thumbnails and back scans", () => {
    const winner = pickBestResolvedCertImageUrl(
      [
        "https://cdn.example.com/thumb-120344868.jpg",
        "https://cdn.example.com/120344868_back.jpg",
        "https://d1htnxwo4o0jhw.cloudfront.net/120344868_front.jpg",
      ],
      "120344868"
    );

    expect(winner).toBe("https://d1htnxwo4o0jhw.cloudfront.net/120344868_front.jpg");
  });

  it("returns null when only non-image page URLs are available", () => {
    const winner = pickBestResolvedCertImageUrl(
      [
        "https://www.psacard.com/cert/120344868/psa",
        "https://www.beckett.com/grading/card-lookup?item_id=120344868&item_type=BGS",
      ],
      "120344868"
    );

    expect(winner).toBeNull();
  });

  it("skips TCGAPIs when no API key is configured", async () => {
    delete process.env.TCGAPIS_API_KEY;
    const fetchImpl = vi.fn();

    await expect(
      resolvePsaCertImageFromTcgapis({ certNumber: "120344868", fetchImpl })
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves PSA images from TCGAPIs when a usable front URL is returned", async () => {
    process.env.TCGAPIS_API_KEY = "test-key";
    process.env.TCGAPIS_BASE_URL = "https://api.example.test/api/v1";
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          images: {
            front: "https://cdn.example.com/120344868_front.jpg",
            back: "https://cdn.example.com/120344868_back.jpg",
          },
        }),
        { status: 200 }
      )
    );

    await expect(
      resolvePsaCertImageFromTcgapis({ certNumber: "120344868", fetchImpl })
    ).resolves.toEqual({
      status: "resolved",
      imageUrl: "https://cdn.example.com/120344868_front.jpg",
      sourcePageUrl: "https://www.psacard.com/cert/120344868/psa",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/psa/120344868",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          accept: "application/json",
        }),
      })
    );
  });

  it("rejects TCGAPIs responses that only return dead PSA image-host URLs", async () => {
    process.env.TCGAPIS_API_KEY = "test-key";
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          images: {
            front: "https://cert-images.psa.com/120344868/large/120344868_f.jpg",
          },
        }),
        { status: 200 }
      )
    );

    await expect(
      resolvePsaCertImageFromTcgapis({ certNumber: "120344868", fetchImpl })
    ).rejects.toThrow("none were usable");
  });
});
