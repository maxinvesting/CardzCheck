import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";

export interface RecentSearchRecord {
  id: string;
  user_id: string;
  search_query: string;
  card_name: string | null;
  filters_used: Record<string, string | undefined>;
  result_count: number | null;
  cmv: number | null;
  searched_at: string;
}

// GET /api/recent-searches - Get user's recent searches
export async function GET() {
  try {
    if (isTestMode()) {
      // Return empty array in test mode
      return NextResponse.json({ searches: [] });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch recent searches ordered by most recent
    const { data: searches, error } = await supabase
      .from("recent_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("searched_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching recent searches:", error);
      return NextResponse.json(
        { error: "Failed to fetch recent searches" },
        { status: 500 }
      );
    }

    return NextResponse.json({ searches: searches || [] });
  } catch (error) {
    console.error("Recent searches GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/recent-searches - Save a new search
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { search_query, card_name, filters_used, result_count, cmv } = body;

    if (!search_query || typeof search_query !== "string") {
      return NextResponse.json(
        { error: "search_query is required" },
        { status: 400 }
      );
    }

    if (isTestMode()) {
      // Return mock search in test mode
      return NextResponse.json({
        search: {
          id: `test-search-${Date.now()}`,
          user_id: "test-user",
          search_query,
          card_name: card_name || null,
          filters_used: filters_used || {},
          result_count: result_count || null,
          cmv: cmv || null,
          searched_at: new Date().toISOString(),
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

    // Check for duplicate consecutive search (same query within last minute)
    const { data: recentSearch } = await supabase
      .from("recent_searches")
      .select("id, search_query, searched_at")
      .eq("user_id", user.id)
      .order("searched_at", { ascending: false })
      .limit(1)
      .single();

    if (recentSearch) {
      const lastSearchTime = new Date(recentSearch.searched_at).getTime();
      const now = Date.now();
      const oneMinute = 60 * 1000;

      // If same query within last minute, skip saving (dedupe)
      if (
        recentSearch.search_query === search_query &&
        now - lastSearchTime < oneMinute
      ) {
        return NextResponse.json({
          search: recentSearch,
          deduplicated: true,
        });
      }
    }

    // Insert new search
    const { data: search, error } = await supabase
      .from("recent_searches")
      .insert({
        user_id: user.id,
        search_query: search_query.trim(),
        card_name: card_name || null,
        filters_used: filters_used || {},
        result_count: result_count || null,
        cmv: cmv || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving search:", error);
      return NextResponse.json(
        { error: "Failed to save search" },
        { status: 500 }
      );
    }

    return NextResponse.json({ search });
  } catch (error) {
    console.error("Recent searches POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/recent-searches - Delete a search or clear all
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clear_all") === "true";

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

    if (clearAll) {
      // Delete all searches for this user
      const { error } = await supabase
        .from("recent_searches")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        console.error("Error clearing searches:", error);
        return NextResponse.json(
          { error: "Failed to clear searches" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, cleared: true });
    }

    if (!id) {
      return NextResponse.json(
        { error: "id or clear_all is required" },
        { status: 400 }
      );
    }

    // Delete specific search
    const { error } = await supabase
      .from("recent_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting search:", error);
      return NextResponse.json(
        { error: "Failed to delete search" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Recent searches DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
