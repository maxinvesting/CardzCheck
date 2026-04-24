import { describe, expect, it } from "vitest";
import {
  findPsaCertObject,
  isPsaInvalidRequestPayload,
  isPsaNotFoundPayload,
  mapPsaCert,
  parsePsaCertHtml,
} from "@/lib/psa/lookup";

describe("PSA lookup helpers", () => {
  it("detects documented no-data API payloads", () => {
    expect(
      isPsaNotFoundPayload({
        IsValidRequest: true,
        ServerMessage: "No data found",
      })
    ).toBe(true);
  });

  it("detects documented invalid-request API payloads", () => {
    expect(
      isPsaInvalidRequestPayload({
        IsValidRequest: false,
        ServerMessage: "Invalid CertNo",
      })
    ).toBe(true);
  });

  it("finds nested cert payloads", () => {
    const payload = {
      result: {
        lookup: {
          item: {
            CertNumber: "81880288",
            Subject: "BIRTHDAY PIKACHU-HOLO",
            Year: "2021",
            BrandTitle: "POKEMON CELEBRATIONS CLASSIC COLLECTION",
            CardNumber: "24",
            ItemGrade: "GEM MT 10",
            Variety: "CLASSIC COLL-BLACK STAR",
          },
        },
      },
    };

    const cert = findPsaCertObject(payload);
    expect(cert).toMatchObject({
      CertNumber: "81880288",
      Subject: "BIRTHDAY PIKACHU-HOLO",
    });
    expect(mapPsaCert(cert || {})).toEqual({
      player_name: "BIRTHDAY PIKACHU-HOLO",
      year: "2021",
      set_name: "POKEMON CELEBRATIONS CLASSIC COLLECTION",
      card_number: "24",
      grade: "PSA 10",
      grading_company: "PSA",
      parallel_type: "CLASSIC COLL-BLACK STAR",
    });
  });

  it("parses item details from the public cert page html", () => {
    const html = `
      <html>
        <body>
          <h3>Item Information</h3>
          <div>Cert Number</div>
          <div>25979277</div>
          <div>Item Grade</div>
          <div>GEM MT 10</div>
          <div>Year</div>
          <div>2015</div>
          <div>Brand/Title</div>
          <div>TOPPS PLATINUM</div>
          <div>Subject</div>
          <div>TODD GURLEY</div>
          <div>Card Number</div>
          <div>103</div>
          <div>Category</div>
          <div>FOOTBALL CARDS</div>
        </body>
      </html>
    `;

    expect(parsePsaCertHtml(html, "25979277")).toEqual({
      player_name: "TODD GURLEY",
      year: "2015",
      set_name: "TOPPS PLATINUM",
      card_number: "103",
      grade: "PSA 10",
      grading_company: "PSA",
      parallel_type: null,
    });
  });
});
