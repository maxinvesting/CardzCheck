import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import type { WatchlistItem } from "@/types";

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
