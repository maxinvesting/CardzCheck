import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLegacyProAccess } from "@/lib/access";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";
import type { WatchlistItem } from "@/types";

type WatchlistRow = Record<string, unknown>;

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTargetPrice(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeWatchlistItem(row: WatchlistRow): WatchlistItem {
  return {
    ...row,
    set_brand: (row.set_brand ?? row.set_name ?? null) as string | null,
    parallel_variant: (row.parallel_variant ?? row.parallel_type ?? null) as string | null,
    condition: (row.condition ?? row.grade ?? null) as string | null,
  } as WatchlistItem;
}

function isUndefinedColumnError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42703";
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

    // Check Pro access (watchlist is Pro-only)
    const isPro = await checkLegacyProAccess(user.id);
    if (!isPro) {
      return NextResponse.json(
        {
          error: "upgrade_required",
          message: "Watchlist is a Pro feature. Upgrade to track card prices.",
        },
        { status: 403 }
      );
    }

    const { data: items, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      items: ((items || []) as WatchlistRow[]).map((item: WatchlistRow) =>
        normalizeWatchlistItem(item)
      ),
    });
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

    // Check Pro access (watchlist is Pro-only)
    const isPro = await checkLegacyProAccess(user.id);
    if (!isPro) {
      return NextResponse.json(
        {
          error: "upgrade_required",
          message: "Watchlist is a Pro feature. Upgrade to track card prices.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const playerName = normalizeText(body.player_name);
    const year = normalizeText(body.year);
    const setBrand = normalizeText(body.set_brand ?? body.set_name);
    const cardNumber = normalizeText(body.card_number);
    const parallelVariant = normalizeText(body.parallel_variant ?? body.parallel_type);
    const condition = normalizeText(body.condition ?? body.grade);
    const targetPrice = normalizeTargetPrice(body.target_price);

    if (!playerName) {
      return NextResponse.json(
        { error: "Player name is required" },
        { status: 400 }
      );
    }

    const insertCandidates: WatchlistRow[] = [
      {
        user_id: user.id,
        player_name: playerName,
        year,
        set_brand: setBrand,
        card_number: cardNumber,
        parallel_variant: parallelVariant,
        condition,
        target_price: targetPrice,
        price_history: [],
      },
      {
        user_id: user.id,
        player_name: playerName,
        year,
        set_name: setBrand,
        card_number: cardNumber,
        parallel_type: parallelVariant,
        grade: condition,
        target_price: targetPrice,
        price_history: [],
      },
      {
        user_id: user.id,
        player_name: playerName,
        target_price: targetPrice,
        price_history: [],
      },
    ];

    let insertedItem: WatchlistRow | null = null;
    let lastError: unknown = null;

    for (let i = 0; i < insertCandidates.length; i += 1) {
      const candidate = insertCandidates[i];
      const { data: item, error } = await supabase
        .from("watchlist")
        .insert(candidate)
        .select()
        .single();

      if (!error && item) {
        insertedItem = item as WatchlistRow;
        break;
      }

      lastError = error;
      const shouldTryFallback =
        i < insertCandidates.length - 1 &&
        (isUndefinedColumnError(error) || Boolean((error as { message?: string } | null)?.message?.includes("column")));
      if (!shouldTryFallback) {
        break;
      }
    }

    if (!insertedItem) {
      throw lastError ?? new Error("Unknown watchlist insert error");
    }

    return NextResponse.json({ item: normalizeWatchlistItem(insertedItem) });
  } catch (error) {
    console.error("Watchlist add error:", error);
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
