import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildSearchQuery,
  searchEbayDualSignal,
  type EbaySearchParams,
} from "@/lib/ebay";
import { logDebug, redactId } from "@/lib/logging";
import {
  buildCardKey,
  runCmvWiringCheck,
  type CmvWiringReport,
} from "@/lib/dev/cmv-wiring";
import type { CollectionItem } from "@/types";

const DEFAULT_IDENTITY = {
  player_name: "Patrick Mahomes",
  year: "2017",
  set_name: "Donruss Optic",
  grade: "PSA 10",
  parallel_type: null,
  card_number: null,
} as const;

const isDevOnly = (): boolean => process.env.NODE_ENV !== "production";

const parseString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatCheck = (label: string, pass: boolean, detail?: string): string => {
  const status = pass ? "PASS" : "FAIL";
  return detail ? `- ${label}: ${status} (${detail})` : `- ${label}: ${status}`;
};

const formatYesNo = (label: string, yes: boolean, detail?: string): string => {
  const status = yes ? "YES" : "NO";
  return detail ? `- ${label}: ${status} (${detail})` : `- ${label}: ${status}`;
};

const buildNotes = (tag: string, parallel: string | null, cardNumber: string | null): string => {
  const parts = [tag];
  if (parallel) parts.push(`Parallel: ${parallel}`);
  if (cardNumber) parts.push(`Card #: ${cardNumber}`);
  return parts.join(" | ");
};

const logItems = (label: string, items: CollectionItem[], summary: CmvWiringReport["collectionSummary"]) => {
  logDebug(`CMV wiring: ${label} items`, {
    count: items.length,
    items: items.map((item) => ({
      card_id: redactId(item.id),
      player_name: item.player_name,
      estimated_cmv: item.estimated_cmv ?? null,
      est_cmv: item.est_cmv ?? null,
      cmv_confidence: item.cmv_confidence ?? null,
      cmv_last_updated: item.cmv_last_updated ?? null,
    })),
  });

  logDebug(`CMV wiring: ${label} summary`, {
    cardCount: summary.cardCount,
    totalDisplayValue: summary.totalDisplayValue,
    totalCostBasis: summary.totalCostBasis,
    totalUnrealizedPL: summary.totalUnrealizedPL,
    totalUnrealizedPLPct: summary.totalUnrealizedPLPct,
    cardsWithCmv: summary.cardsWithCmv,
  });
};

async function handleRequest(request: NextRequest) {
  if (!isDevOnly()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const body =
    request.method === "POST"
      ? await request.json().catch(() => ({}))
      : {};

  const getParam = (key: string, fallbackKey?: string): string | null => {
    return (
      parseString(body?.[key]) ??
      parseString(searchParams.get(key)) ??
      (fallbackKey ? parseString(body?.[fallbackKey]) ?? parseString(searchParams.get(fallbackKey)) : null)
    );
  };

  const player_name = getParam("player", "player_name") ?? DEFAULT_IDENTITY.player_name;
  const year = getParam("year") ?? DEFAULT_IDENTITY.year;
  const set_name = getParam("set", "set_name") ?? DEFAULT_IDENTITY.set_name;
  const grade = getParam("grade") ?? DEFAULT_IDENTITY.grade;
  const parallel_type = getParam("parallel_type");
  const card_number = getParam("card_number");
  const purchase_price =
    parseNumber(body?.purchase_price) ??
    parseNumber(searchParams.get("purchase_price")) ??
    100;

  const identity = {
    player_name,
    year,
    set_name,
    grade,
    parallel_type,
    card_number,
  };

  const cardKey = buildCardKey(identity);
  const testTag = `CMV_WIRING_TEST:${cardKey || "unknown"}`;
  const notes = buildNotes(testTag, parallel_type, card_number);

  const forceNew =
    body?.force_new === true ||
    parseString(body?.force_new) === "true" ||
    searchParams.get("force_new") === "true";

  let card: CollectionItem | null = null;

  if (!forceNew) {
    const { data: existing, error } = await supabase
      .from("collection_items")
      .select("*")
      .eq("user_id", user.id)
      .ilike("notes", `%${testTag}%`)
      .limit(1);

    if (error) {
      logDebug("CMV wiring: failed to find existing test card", {
        message: error.message,
      });
    }

    card = existing?.[0] ?? null;
  }

  if (!card) {
    const { data: inserted, error } = await supabase
      .from("collection_items")
      .insert({
        user_id: user.id,
        player_name,
        year,
        set_name,
        grade,
        purchase_price,
        purchase_date: null,
        image_url: null,
        notes,
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return NextResponse.json(
        { error: "Failed to insert test card", message: error?.message },
        { status: 500 }
      );
    }

    card = inserted;
  }

  if (!card) {
    return NextResponse.json({ error: "Card not found after insert" }, { status: 500 });
  }

  const searchParamsObj: EbaySearchParams = {
    player: player_name,
    year: year ?? undefined,
    set: set_name ?? undefined,
    grade: grade ?? undefined,
    parallelType: parallel_type ?? undefined,
    cardNumber: card_number ?? undefined,
  };

  const report = await runCmvWiringCheck({
    cardId: card.id,
    cardKey,
    deps: {
      fetchComps: async () => {
        const result = await searchEbayDualSignal(searchParamsObj);

        let cmvMid = result.forSale.median;
        let cmvLow = result.forSale.low;
        let cmvHigh = result.forSale.high;

        if (result.estimatedSaleRange.pricingAvailable) {
          const { low, high } = result.estimatedSaleRange.estimatedSaleRange;
          cmvMid = Math.round(((low + high) / 2) * 100) / 100;
          cmvLow = low;
          cmvHigh = high;
        }

        return {
          compsCount: result.forSale.count,
          cmvMid: Number.isFinite(cmvMid) ? cmvMid : null,
          cmvLow,
          cmvHigh,
        };
      },
      persistCmv: async ({ cmvMid, updatedAt, compsCount }) => {
        const cmvValue = cmvMid !== null && Number.isFinite(cmvMid) ? cmvMid : null;
        const cmvPayload =
          cmvValue !== null
            ? {
                estimated_cmv: cmvValue,
                est_cmv: cmvValue,
                cmv_confidence: "medium" as const,
                cmv_last_updated: updatedAt,
              }
            : {
                estimated_cmv: null,
                est_cmv: null,
                cmv_confidence: "unavailable" as const,
                cmv_last_updated: updatedAt,
              };

        const { data: updated, error } = await supabase
          .from("collection_items")
          .update(cmvPayload)
          .eq("id", card.id)
          .eq("user_id", user.id)
          .select("*")
          .single();

        if (error) {
          logDebug("CMV wiring: failed to persist CMV", {
            cardId: redactId(card.id),
            message: error.message,
          });
          return null;
        }

        logDebug("CMV wiring: persisted CMV", {
          card_id: redactId(card.id),
          card_key: cardKey,
          comps_count: compsCount,
          cmv_mid: cmvValue,
          updated_at: updatedAt,
        });

        return updated ?? null;
      },
      fetchCollectionItems: async () => {
        const { data: items, error } = await supabase
          .from("collection_items")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          logDebug("CMV wiring: failed to fetch collection items", {
            message: error.message,
          });
          return [];
        }

        return items ?? [];
      },
      fetchDashboardItems: async () => {
        const { data: items, error } = await supabase
          .from("collection_items")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          logDebug("CMV wiring: failed to fetch dashboard items", {
            message: error.message,
          });
          return [];
        }

        return items ?? [];
      },
    },
  });

  logItems("collection", report.collectionItems, report.collectionSummary);
  logItems("dashboard", report.dashboardItems, report.dashboardSummary);

  const summary = report.collectionSummary;
  const dashboardSummary = report.dashboardSummary;

  let recentSearchSaved = false;
  try {
    const searchQuery = buildSearchQuery(searchParamsObj);
    const { error: recentError } = await supabase
      .from("recent_searches")
      .insert({
        user_id: user.id,
        search_query: searchQuery,
        card_name: [player_name, year, set_name, grade].filter(Boolean).join(" "),
        filters_used: {
          player: player_name,
          year,
          set: set_name,
          grade,
          parallel_type,
          card_number,
        },
        result_count: report.compsCount,
        cmv: report.cmvMid ?? null,
      });

    if (recentError) {
      logDebug("CMV wiring: failed to persist recent search", {
        message: recentError.message,
      });
    } else {
      recentSearchSaved = true;
    }
  } catch (error) {
    logDebug("CMV wiring: error persisting recent search", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const lines = [
    "PASS/FAIL",
    formatCheck("Comps fetched", report.checks.compsFetched, `count=${report.compsCount}`),
    formatCheck("CMV computed", report.checks.cmvComputed, `cmv=${report.cmvMid ?? "null"}`),
    formatCheck("CMV persisted for card_id", report.checks.cmvPersisted, `card_id=${redactId(report.cardId)}`),
    formatCheck("Collection query returns CMV", report.checks.collectionReturnsCmv, `cmv=${report.cmvMid ?? "null"}`),
    formatCheck(
      "Dashboard totals match collection",
      report.checks.dashboardTotalsMatchCollection,
      `collection=${summary.totalDisplayValue ?? "null"}, dashboard=${dashboardSummary.totalDisplayValue ?? "null"}`
    ),
    formatYesNo("Null-to-0 bug present", report.checks.nullToZeroBugPresent),
  ];

  const ok =
    report.checks.compsFetched &&
    report.checks.cmvComputed &&
    report.checks.cmvPersisted &&
    report.checks.collectionReturnsCmv &&
    report.checks.dashboardTotalsMatchCollection &&
    !report.checks.nullToZeroBugPresent;

  return NextResponse.json({
    ok,
    card: {
      id: report.cardId,
      cardKey: report.cardKey,
      identity,
      notes: card.notes,
    },
    comps: {
      count: report.compsCount,
      cmv_mid: report.cmvMid,
      cmv_low: report.cmvLow,
      cmv_high: report.cmvHigh,
    },
    stored: {
      estimated_cmv: report.persistedItem?.estimated_cmv ?? null,
      est_cmv: report.persistedItem?.est_cmv ?? null,
      cmv_confidence: report.persistedItem?.cmv_confidence ?? null,
      cmv_last_updated: report.persistedItem?.cmv_last_updated ?? report.updatedAt,
    },
    collection: {
      summary: report.collectionSummary,
    },
    dashboard: {
      summary: report.dashboardSummary,
    },
    checks: report.checks,
    pass_fail_table: lines.join("\n"),
    recent_search_saved: recentSearchSaved,
    warnings:
      report.compsCount === 0
        ? ["No comps returned; CMV may be null or 0 depending on data availability."]
        : [],
  });
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
