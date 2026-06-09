import { describe, expect, it } from "vitest";
import {
  buildTrustedCardImage,
  normalizeTrustedImageUrl,
  pickUserCardImages,
} from "@/lib/images/shared";
import type { CardImage } from "@/types";

describe("trusted image shared helpers", () => {
  it("filters placeholder and dead PSA image-host URLs", () => {
    expect(normalizeTrustedImageUrl("https://placehold.co/300x400?text=card")).toBeNull();
    // cert-images.psa.com is NXDOMAIN — TCGAPIs fabricates these; they never load.
    expect(
      normalizeTrustedImageUrl("https://cert-images.psa.com/120344868/large/120344868_f.jpg")
    ).toBeNull();
    expect(normalizeTrustedImageUrl("https://example.com/card-front.jpg")).toBe(
      "https://example.com/card-front.jpg"
    );
  });

  it("prioritizes PSA images over user uploads", () => {
    const trusted = buildTrustedCardImage({
      certFrontUrl: "https://psa.example/front.jpg",
      certBackUrl: "https://psa.example/back.jpg",
      certImageSource: "psa",
      userFrontUrl: "https://user.example/front.jpg",
      userBackUrl: "https://user.example/back.jpg",
    });

    expect(trusted.source).toBe("psa");
    expect(trusted.frontUrl).toBe("https://psa.example/front.jpg");
    expect(trusted.backUrl).toBe("https://psa.example/back.jpg");
    expect(trusted.frontCandidates).toEqual([
      "https://psa.example/front.jpg",
      "https://user.example/front.jpg",
    ]);
  });

  it("falls back to user images when PSA is unavailable", () => {
    const trusted = buildTrustedCardImage({
      userFrontUrl: "https://user.example/front.jpg",
      userBackUrl: "https://user.example/back.jpg",
    });

    expect(trusted.source).toBe("user");
    expect(trusted.frontUrl).toBe("https://user.example/front.jpg");
    expect(trusted.backUrl).toBe("https://user.example/back.jpg");
    expect(trusted.hasFallbackCta).toBe(false);
  });

  it("picks labeled front/back user uploads first", () => {
    const images: CardImage[] = [
      {
        id: "back",
        card_id: "card-1",
        user_id: "user-1",
        storage_path: "back.jpg",
        position: 1,
        label: "back",
        created_at: new Date().toISOString(),
        url: "https://user.example/back.jpg",
      },
      {
        id: "front",
        card_id: "card-1",
        user_id: "user-1",
        storage_path: "front.jpg",
        position: 0,
        label: "front",
        created_at: new Date().toISOString(),
        url: "https://user.example/front.jpg",
      },
    ];

    expect(pickUserCardImages(images)).toEqual({
      frontUrl: "https://user.example/front.jpg",
      backUrl: "https://user.example/back.jpg",
    });
  });
});
