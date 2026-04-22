import { describe, expect, it } from "vitest";
import {
  buildCertPageUrl,
  certImageSourceForGrader,
  isCertImageSource,
  isUsableResolvedCertImageUrl,
  normalizeCertGrader,
  normalizeCertNumberForGrader,
  normalizeCertWriteFields,
} from "@/lib/images/cert-image";

describe("cert image helpers", () => {
  it("normalizes supported graders", () => {
    expect(normalizeCertGrader("psa")).toBe("PSA");
    expect(normalizeCertGrader(" BGS ")).toBe("BGS");
    expect(normalizeCertGrader("other")).toBeNull();
  });

  it("normalizes cert numbers conservatively", () => {
    expect(normalizeCertNumberForGrader(" Cert #120344868 ", "PSA")).toBe("120344868");
    expect(normalizeCertNumberForGrader("abc 123", "SGC")).toBe("ABC123");
    expect(normalizeCertNumberForGrader("", "PSA")).toBeNull();
  });

  it("builds official cert page URLs for all graders", () => {
    expect(buildCertPageUrl({ grader: "PSA", certNumber: "120344868" })).toBe(
      "https://www.psacard.com/cert/120344868/psa"
    );
    expect(buildCertPageUrl({ grader: "BGS", certNumber: "0015670564" })).toContain(
      "https://www.beckett.com/grading/card-lookup"
    );
    expect(buildCertPageUrl({ grader: "SGC", certNumber: "1234567" })).toBe(
      "https://www.gosgc.com/cert-code-lookup"
    );
    expect(buildCertPageUrl({ grader: "CGC", certNumber: "1234567" })).toBe(
      "https://www.cgccards.com/certlookup"
    );
  });

  it("rejects dead or page-like cert image URLs", () => {
    expect(
      isUsableResolvedCertImageUrl("https://cert-images.psa.com/120344868/large/120344868_f.jpg")
    ).toBe(false);
    expect(isUsableResolvedCertImageUrl("https://www.psacard.com/cert/120344868/psa")).toBe(false);
    expect(isUsableResolvedCertImageUrl("https://d1htnxwo4o0jhw.cloudfront.net/card/front.jpg")).toBe(
      true
    );
  });

  it("maps cert grader to image source and write payloads", () => {
    expect(certImageSourceForGrader("BGS")).toBe("bgs");
    expect(isCertImageSource("cgc")).toBe(true);
    expect(
      normalizeCertWriteFields({
        grading_company: "PSA",
        cert_number: "Cert #120344868",
      })
    ).toEqual({
      grading_company: "PSA",
      cert_number: "120344868",
      psa_cert_number: "120344868",
    });
  });
});
