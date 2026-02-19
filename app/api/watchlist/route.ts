import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";
import { hasBusinessAccess } from "@/lib/access";
import type { WatchlistItem } from "@/types";

type ProspectRow = {
  id: string;
  user_id: string;
  player_name: string;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  parallel_type: string | null;
  grade: string | null;
  target_price: number | null;
  list_price_cents: number | null;
  estimated_cmv: number | null;
  est_cmv: number | null;
  current_market_value_cents: number | null;
  created_at: string;
  updated_at?: string | null;
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCents(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100);
}

function deriveProspectTitle(input: {
  player_name: string;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
}): string {
  const display = [input.year, input.player_name, input.set_name, input.grade]
    .filter(Boolean)
    .join(" ")
    .trim();
  return display || input.player_name || "Untitled prospect";
}

function mapProspectToWatchlistItem(row: ProspectRow): WatchlistItem {
  const listPrice =
    typeof row.list_price_cents === "number" ? row.list_price_cents / 100 : null;
  const lastPriceFromCents =
    typeof row.current_market_value_cents === "number"
      ? row.current_market_value_cents / 100
      : null;
  const lastPrice = row.estimated_cmv ?? row.est_cmv ?? lastPriceFromCents;

  return {
    id: row.id,
    user_id: row.user_id,
    player_name: row.player_name,
    year: row.year,
    set_brand: row.set_name,
    card_number: row.card_number,
    parallel_variant: row.parallel_type,
    condition: row.grade,
    target_price: row.target_price ?? listPrice,
    last_price: lastPrice,
    last_checked: null,
    price_history: [],
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

// GET - List watchlist items
export async function GET() {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      logDebug("Test mode: Bypassing watchlist auth");
      return NextResponse.json({ items: [] });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isBusinessUser = await hasBusinessAccess(user.id);
    if (isBusinessUser) {
      const { data: items, error } = await supabase
        .from("collection_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("item_kind", "prospect")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return NextResponse.json({
        items: ((items || []) as ProspectRow[]).map(mapProspectToWatchlistItem),
      });
    }

    const { data: items, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ items: items as WatchlistItem[] });
  } catch (error) {
    console.error("Watchlist fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}

// POST - Add item to watchlist
export async function POST(request: NextRequest) {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      logDebug("Test mode: Bypassing watchlist add auth");
      const body = await request.json();
      const now = new Date().toISOString();
      return NextResponse.json({
        item: {
          ...body,
          id: `test-${Date.now()}`,
          user_id: "test-user-id",
          created_at: now,
          updated_at: now,
          last_price: null,
          last_checked: null,
          price_history: [],
        },
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      player_name,
      year,
      set_brand,
      card_number,
      parallel_variant,
      condition,
      target_price,
    } = body;

    if (!player_name) {
      return NextResponse.json(
        { error: "Player name is required" },
        { status: 400 }
      );
    }

    const isBusinessUser = await hasBusinessAccess(user.id);
    if (isBusinessUser) {
      const normalizedTarget = toNumberOrNull(target_price);
      const { data: item, error } = await supabase
        .from("collection_items")
        .insert({
          user_id: user.id,
          item_kind: "prospect",
          title: deriveProspectTitle({
            player_name,
            year: year || null,
            set_name: set_brand || null,
            grade: condition || null,
          }),
          player_name,
          year: year || null,
          set_name: set_brand || null,
          card_number: card_number || null,
          parallel_type: parallel_variant || null,
          grade: condition || null,
          acquisition_type: "other",
          quantity: 1,
          condition_status:
            condition && condition.toLowerCase().includes("raw")
              ? "raw"
              : "graded",
          channel: "other",
          status: "unlisted",
          target_price: normalizedTarget,
          list_price_cents: toCents(normalizedTarget),
        })
        .select("*")
        .single();

      if (error) throw error;

      return NextResponse.json({
        item: mapProspectToWatchlistItem(item as ProspectRow),
        destination: "prospect",
      });
    }

    const { data: item, error } = await supabase
      .from("watchlist")
      .insert({
        user_id: user.id,
        player_name,
        year: year || null,
        set_brand: set_brand || null,
        card_number: card_number || null,
        parallel_variant: parallel_variant || null,
        condition: condition || null,
        target_price: target_price || null,
        price_history: [],
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ item: item as WatchlistItem });
  } catch (error) {
    const err = error as { code?: string; message?: string } | null;
    console.error(
      "Watchlist add error. code:",
      err?.code,
      "message:",
      err?.message,
      error
    );
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    );
  }
}

// DELETE - Remove item from watchlist
export async function DELETE(request: NextRequest) {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      logDebug("Test mode: Bypassing watchlist delete auth");
      return NextResponse.json({ success: true });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    const isBusinessUser = await hasBusinessAccess(user.id);
    if (isBusinessUser) {
      const { error } = await supabase
        .from("collection_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("item_kind", "prospect");
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Watchlist delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete from watchlist" },
      { status: 500 }
    );
  }
}

// PATCH - Update watchlist item
export async function PATCH(request: NextRequest) {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      logDebug("Test mode: Bypassing watchlist update auth");
      const body = await request.json();
      return NextResponse.json({ item: body });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    const isBusinessUser = await hasBusinessAccess(user.id);
    if (isBusinessUser) {
      const allowedUpdates: Record<string, unknown> = {};
      if (updates.target_price !== undefined) {
        const target = toNumberOrNull(updates.target_price);
        allowedUpdates.target_price = target;
        allowedUpdates.list_price_cents = toCents(target);
      }
      if (updates.condition !== undefined) {
        allowedUpdates.grade = updates.condition;
        allowedUpdates.condition_status =
          typeof updates.condition === "string" &&
          updates.condition.toLowerCase().includes("raw")
            ? "raw"
            : "graded";
      }

      const { data: item, error } = await supabase
        .from("collection_items")
        .update(allowedUpdates)
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("item_kind", "prospect")
        .select("*")
        .single();

      if (error) throw error;

      return NextResponse.json({
        item: mapProspectToWatchlistItem(item as ProspectRow),
      });
    }

    // Only allow updating specific fields
    const allowedUpdates: Record<string, unknown> = {};
    if (updates.target_price !== undefined)
      allowedUpdates.target_price = updates.target_price;
    if (updates.condition !== undefined)
      allowedUpdates.condition = updates.condition;

    const { data: item, error } = await supabase
      .from("watchlist")
      .update(allowedUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ item: item as WatchlistItem });
  } catch (error) {
    console.error("Watchlist update error:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist item" },
      { status: 500 }
    );
  }
}

