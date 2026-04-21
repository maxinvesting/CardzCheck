import { describe, expect, it } from "vitest";
import { buildCertImageItemUpdate } from "@/lib/images/cert-image-jobs";

describe("cert image job item updates", () => {
  it("writes grader image fields on resolution", () => {
    expect(
      buildCertImageItemUpdate({
        grader: "PSA",
        status: "resolved",
        imageUrl: "https://cdn.example.com/120344868_front.jpg",
        currentImageSource: "none",
      })
    ).toEqual({
      image_source: "psa",
      image_url: "https://cdn.example.com/120344868_front.jpg",
      cert_image_status: "resolved",
      cert_image_last_error: null,
    });
  });

  it("clears stale grader images when resolution fails", () => {
    expect(
      buildCertImageItemUpdate({
        grader: "BGS",
        status: "failed",
        lastError: "challenge",
        currentImageSource: "bgs",
      })
    ).toEqual({
      image_source: "none",
      image_url: null,
      cert_image_status: "failed",
      cert_image_last_error: "challenge",
    });
  });

  it("preserves non-cert image ownership when no cert image exists", () => {
    expect(
      buildCertImageItemUpdate({
        grader: "CGC",
        status: "no_image",
        currentImageSource: "user",
      })
    ).toEqual({
      image_source: "user",
      image_url: null,
      cert_image_status: "no_image",
      cert_image_last_error: null,
    });
  });
});
