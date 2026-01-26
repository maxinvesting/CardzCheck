import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import type { AnalystThread } from "@/types";

// GET /api/analyst/threads - List user's threads
export async function GET() {
  try {
    if (isTestMode()) {
      // Return mock threads for test mode
      const mockThreads: AnalystThread[] = [
        {
          id: "test-thread-1",
          user_id: "test-user",
          title: "Test Chat",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      return NextResponse.json({ threads: mockThreads });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch threads ordered by most recently updated
    const { data: threads, error } = await supabase
      .from("analyst_threads")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching threads:", error);
      return NextResponse.json(
        { error: "Failed to fetch threads" },
        { status: 500 }
      );
    }

    return NextResponse.json({ threads: threads || [] });
  } catch (error) {
    console.error("Threads GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/analyst/threads - Create a new thread
export async function POST(request: NextRequest) {
  try {
    let title = "New Chat";

    // Parse optional title from body
    try {
      const body = await request.json();
      if (body.title && typeof body.title === "string") {
        title = body.title.slice(0, 100); // Limit title length
      }
    } catch {
      // No body or invalid JSON, use default title
    }

    if (isTestMode()) {
      const mockThread: AnalystThread = {
        id: `test-thread-${Date.now()}`,
        user_id: "test-user",
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return NextResponse.json({ thread: mockThread });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is paid (analyst is a Pro feature)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("is_paid")
      .eq("id", user.id)
      .single();

    if (userError && userError.code !== "PGRST116") {
      console.error("Error fetching user:", userError);
      return NextResponse.json(
        { error: "Failed to verify user" },
        { status: 500 }
      );
    }

    if (!userData?.is_paid) {
      return NextResponse.json(
        {
          error: "upgrade_required",
          message: "Analyst is a Pro feature. Upgrade to access chat history.",
        },
        { status: 403 }
      );
    }

    // Create new thread
    const { data: thread, error } = await supabase
      .from("analyst_threads")
      .insert({
        user_id: user.id,
        title,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating thread:", error);
      return NextResponse.json(
        { error: "Failed to create thread" },
        { status: 500 }
      );
    }

    return NextResponse.json({ thread });
  } catch (error) {
    console.error("Threads POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
