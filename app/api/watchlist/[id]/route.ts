import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
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

// GET - Get single watchlist item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (isTestMode()) {
      return NextResponse.json({ item: null });
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
      const { data: item, error } = await supabase
        .from("collection_items")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("item_kind", "prospect")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return NextResponse.json({ error: "Item not found" }, { status: 404 });
        }
        throw error;
      }

      return NextResponse.json({
        item: mapProspectToWatchlistItem(item as ProspectRow),
      });
    }

    const { data: item, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ item: item as WatchlistItem });
  } catch (error) {
    console.error("Watchlist item fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist item" },
      { status: 500 }
    );
  }
}

// PATCH - Update single watchlist item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (isTestMode()) {
      const body = await request.json();
      return NextResponse.json({ item: { id, ...body } });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const isBusinessUser = await hasBusinessAccess(user.id);

    if (isBusinessUser) {
      const allowedUpdates: Record<string, unknown> = {};
      if (body.target_price !== undefined) {
        const target = toNumberOrNull(body.target_price);
        allowedUpdates.target_price = target;
        allowedUpdates.list_price_cents = toCents(target);
      }
      if (body.condition !== undefined) {
        allowedUpdates.grade = body.condition;
        allowedUpdates.condition_status =
          typeof body.condition === "string" &&
          body.condition.toLowerCase().includes("raw")
            ? "raw"
            : "graded";
      }
      if (body.parallel_variant !== undefined) {
        allowedUpdates.parallel_type = body.parallel_variant;
      }

      const { data: item, error } = await supabase
        .from("collection_items")
        .update(allowedUpdates)
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("item_kind", "prospect")
        .select("*")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return NextResponse.json({ error: "Item not found" }, { status: 404 });
        }
        throw error;
      }

      return NextResponse.json({
        item: mapProspectToWatchlistItem(item as ProspectRow),
      });
    }

    // Only allow updating specific fields
    const allowedUpdates: Record<string, unknown> = {};
    if (body.target_price !== undefined)
      allowedUpdates.target_price = body.target_price;
    if (body.condition !== undefined) allowedUpdates.condition = body.condition;
    if (body.parallel_variant !== undefined)
      allowedUpdates.parallel_variant = body.parallel_variant;

    const { data: item, error } = await supabase
      .from("watchlist")
      .update(allowedUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ item: item as WatchlistItem });
  } catch (error) {
    console.error("Watchlist item update error:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist item" },
      { status: 500 }
    );
  }
}

// DELETE - Delete single watchlist item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (isTestMode()) {
      return NextResponse.json({ success: true });
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
      const { error } = await supabase
        .from("collection_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("item_kind", "prospect");

      if (error) {
        throw error;
      }

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
    console.error("Watchlist item delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete watchlist item" },
      { status: 500 }
    );
  }
}

