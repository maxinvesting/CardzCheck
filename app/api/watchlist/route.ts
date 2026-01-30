import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLegacyProAccess } from "@/lib/access";
import { isTestMode } from "@/lib/test-mode";
import type { WatchlistItem } from "@/types";

// GET - List watchlist items
export async function GET() {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      console.log("Test mode: Bypassing watchlist auth");
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
      console.log("Test mode: Bypassing watchlist add auth");
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
      console.log("Test mode: Bypassing watchlist delete auth");
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
      console.log("Test mode: Bypassing watchlist update auth");
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
