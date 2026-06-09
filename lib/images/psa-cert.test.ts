import { describe, expect, it } from "vitest";
import {
  extractPsaImageUrls,
  mapPsaApiImages,
  normalizePsaCertNumber,
} from "@/lib/images/psa-cert";

describe("PSA cert helpers", () => {
  it("normalizes cert numbers to digits only", () => {
    expect(normalizePsaCertNumber(" 1234 567 ")).toBe("1234567");
    expect(normalizePsaCertNumber("Cert #120344868")).toBe("120344868");
    expect(normalizePsaCertNumber("")).toBeNull();
    expect(normalizePsaCertNumber(null)).toBeNull();
    expect(normalizePsaCertNumber("12")).toBeNull();
  });

  it("maps GetImagesByCertNumber response by IsFrontImage flag", () => {
    const payload = [
      { IsFrontImage: false, ImageURL: "https://d1htnxwo4o0jhw.cloudfront.net/cert/120344868_b.jpg" },
      { IsFrontImage: true, ImageURL: "https://d1htnxwo4o0jhw.cloudfront.net/cert/120344868_f.jpg" },
    ];

    expect(mapPsaApiImages(payload)).toEqual({
      frontImageUrl: "https://d1htnxwo4o0jhw.cloudfront.net/cert/120344868_f.jpg",
      backImageUrl: "https://d1htnxwo4o0jhw.cloudfront.net/cert/120344868_b.jpg",
    });
  });

  it("falls back to document order when IsFrontImage is absent", () => {
    const payload = [
      { ImageURL: "https://d1htnxwo4o0jhw.cloudfront.net/cert/a.jpg" },
      { ImageURL: "https://d1htnxwo4o0jhw.cloudfront.net/cert/b.jpg" },
    ];

    expect(mapPsaApiImages(payload)).toEqual({
      frontImageUrl: "https://d1htnxwo4o0jhw.cloudfront.net/cert/a.jpg",
      backImageUrl: "https://d1htnxwo4o0jhw.cloudfront.net/cert/b.jpg",
    });
  });

  it("returns nulls when GetImagesByCertNumber response is empty", () => {
    expect(mapPsaApiImages([])).toEqual({
      frontImageUrl: null,
      backImageUrl: null,
    });
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
