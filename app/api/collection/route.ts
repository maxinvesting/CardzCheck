import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/types";
import { isTestMode } from "@/lib/test-mode";

// GET - List collection items
export async function GET() {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      console.log("🧪 TEST MODE: Bypassing collection auth");
      return NextResponse.json({ items: [] });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: items, error } = await supabase
      .from("collection_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Collection fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

// POST - Add item to collection
export async function POST(request: NextRequest) {
  try {
    // Bypass auth and limits in test mode
    if (isTestMode()) {
      console.log("🧪 TEST MODE: Bypassing collection limits");
      const body = await request.json();
      return NextResponse.json({ 
        item: {
          ...body,
          id: `test-${Date.now()}`,
          user_id: "test-user-id",
          created_at: new Date().toISOString(),
        }
      });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user limits
    const { data: userData } = await supabase
      .from("users")
      .select("is_paid")
      .eq("id", user.id)
      .single();

    const { count } = await supabase
      .from("collection_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (!userData?.is_paid && (count || 0) >= LIMITS.FREE_COLLECTION) {
      return NextResponse.json(
        { error: "limit_reached", type: "collection" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      player_name,
      year,
      set_name,
      grade,
      purchase_price,
      purchase_date,
      image_url,
      notes,
    } = body;

    if (!player_name) {
      return NextResponse.json(
        { error: "Player name is required" },
        { status: 400 }
      );
    }

    const { data: item, error } = await supabase
      .from("collection_items")
      .insert({
        user_id: user.id,
        player_name,
        year: year || null,
        set_name: set_name || null,
        grade: grade || null,
        purchase_price: purchase_price || null,
        purchase_date: purchase_date || null,
        image_url: image_url || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Collection add error:", error);
    return NextResponse.json(
      { error: "Failed to add to collection" },
      { status: 500 }
    );
  }
}

// DELETE - Remove item from collection
export async function DELETE(request: NextRequest) {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      console.log("🧪 TEST MODE: Bypassing collection delete auth");
      return NextResponse.json({ success: true });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("collection_items")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Collection delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}

// PATCH - Update item
export async function PATCH(request: NextRequest) {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      console.log("🧪 TEST MODE: Bypassing collection update auth");
      const body = await request.json();
      return NextResponse.json({ item: body });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    const { data: item, error } = await supabase
      .from("collection_items")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Collection update error:", error);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}
