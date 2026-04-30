import { describe, expect, it } from "vitest";
import {
  findInventoryVoiceTarget,
  parseInventoryVoiceCommand,
  parseVoiceSalePrice,
  parseVoiceSalesChannel,
  parseVoiceSoldDate,
} from "@/lib/voice-commands";

const referenceDate = new Date(2026, 3, 28);

describe("parseInventoryVoiceCommand", () => {
  it("parses mark-sold with a numeric price and channel", () => {
    expect(parseInventoryVoiceCommand("Mark this card sold for 25 dollars on eBay")).toEqual({
      type: "mark_sold",
      transcript: "Mark this card sold for 25 dollars on eBay",
      salePriceCents: 2500,
      channel: "ebay",
      soldAt: null,
    });
  });

  it("parses mark-sold with spoken number price words", () => {
    const command = parseInventoryVoiceCommand("sold it for twenty five dollars on whatnot");
    expect(command.type).toBe("mark_sold");
    expect(command).toMatchObject({
      salePriceCents: 2500,
      channel: "whatnot",
    });
  });

  it("allows mark-sold without a price so the sale modal can be filled manually", () => {
    expect(parseInventoryVoiceCommand("mark sold on local")).toMatchObject({
      type: "mark_sold",
      salePriceCents: null,
      channel: "local",
    });
  });

  it("parses delete, confirm, and cancel commands", () => {
    expect(parseInventoryVoiceCommand("delete this card")).toEqual({
      type: "delete_card",
      transcript: "delete this card",
    });
    expect(parseInventoryVoiceCommand("delete it")).toEqual({
      type: "delete_card",
      transcript: "delete it",
    });
    expect(parseInventoryVoiceCommand("confirm delete")).toEqual({
      type: "confirm",
      transcript: "confirm delete",
    });
    expect(parseInventoryVoiceCommand("cancel")).toEqual({
      type: "cancel",
      transcript: "cancel",
    });
  });

  it("falls back to unknown for non-action speech", () => {
    expect(parseInventoryVoiceCommand("which cards should I hold")).toEqual({
      type: "unknown",
      transcript: "which cards should I hold",
    });
  });
});

describe("voice command helpers", () => {
  it("parses common price formats", () => {
    expect(parseVoiceSalePrice("sold for $42.50")).toBe(4250);
    expect(parseVoiceSalePrice("sale price is 19 bucks")).toBe(1900);
    expect(parseVoiceSalePrice("sold for one hundred twenty five dollars")).toBe(12500);
  });

  it("parses sales channels", () => {
    expect(parseVoiceSalesChannel("mark sold on e bay")).toBe("ebay");
    expect(parseVoiceSalesChannel("sold in person cash")).toBe("local");
    expect(parseVoiceSalesChannel("record sale on Instagram")).toBe("instagram");
  });

  it("parses relative and month date phrases", () => {
    expect(parseVoiceSoldDate("sold today", { referenceDate })).toBe("2026-04-28");
    expect(parseVoiceSoldDate("sold yesterday", { referenceDate })).toBe("2026-04-27");
    expect(parseVoiceSoldDate("sold on March 21", { referenceDate })).toBe("2026-03-21");
    expect(parseVoiceSoldDate("sold 2026-04-20", { referenceDate })).toBe("2026-04-20");
  });

  it("matches a named inventory target from natural speech", () => {
    const items = [
      { id: "1", title: "2024 Jayden Daniels Topps Finest Rookie Auto 9.5" },
      { id: "2", title: "2023 CJ Stroud Topps Composite Chrome" },
    ];

    expect(
      findInventoryVoiceTarget("mark Jayden Daniels sold for 25 dollars on eBay", items)
    )?.toEqual(items[0]);
    expect(findInventoryVoiceTarget("delete CJ Stroud", items))?.toEqual(items[1]);
  });

  it("does not guess when multiple targets are tied", () => {
    const items = [
      { id: "1", title: "2024 Jayden Daniels Topps Finest" },
      { id: "2", title: "2024 Jayden Daniels Panini Prizm" },
    ];

    expect(findInventoryVoiceTarget("delete Jayden Daniels", items)).toBeNull();
  });
});
