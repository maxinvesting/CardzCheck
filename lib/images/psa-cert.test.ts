import { describe, expect, it } from "vitest";
import { extractPsaImageUrls, normalizePsaCertNumber } from "@/lib/images/psa-cert";

describe("PSA cert helpers", () => {
  it("normalizes cert numbers", () => {
    expect(normalizePsaCertNumber(" 1234 567 ")).toBe("1234567");
    expect(normalizePsaCertNumber("")).toBeNull();
    expect(normalizePsaCertNumber(null)).toBeNull();
  });

  it("extracts front and back images from nested PSA payloads", () => {
    const payload = {
      cert: {
        images: {
          frontImage: "https://psa.example/front.jpg",
          backImage: "https://psa.example/back.jpg",
          thumbnail: "https://psa.example/thumb.jpg",
        },
      },
    };

    expect(extractPsaImageUrls(payload)).toEqual({
      frontImageUrl: "https://psa.example/front.jpg",
      backImageUrl: "https://psa.example/back.jpg",
    });
  });

  it("ignores placeholder and thumbnail-only image values", () => {
    const payload = {
      cert: {
        media: {
          imageLogo: "https://psa.example/logo.jpg",
          thumbnailImage: "https://psa.example/thumb.jpg",
          frontImage: "https://placehold.co/300x400?text=card",
        },
      },
    };

    expect(extractPsaImageUrls(payload)).toEqual({
      frontImageUrl: null,
      backImageUrl: null,
    });
  });
});
