import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import type { AnalystThread, AnalystThreadMessage } from "@/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/analyst/threads/[id] - Get a thread with its messages
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;

    if (isTestMode()) {
      const mockThread: AnalystThread = {
        id: threadId,
        user_id: "test-user",
        title: "Test Chat",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const mockMessages: AnalystThreadMessage[] = [];
      return NextResponse.json({ thread: mockThread, messages: mockMessages });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch thread (RLS will ensure user owns it)
    const { data: thread, error: threadError } = await supabase
      .from("analyst_threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError) {
      if (threadError.code === "PGRST116") {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      console.error("Error fetching thread:", threadError);
      return NextResponse.json(
        { error: "Failed to fetch thread" },
        { status: 500 }
      );
    }

    // Fetch messages ordered by created_at ascending
    const { data: messages, error: messagesError } = await supabase
      .from("analyst_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({ thread, messages: messages || [] });
  } catch (error) {
    console.error("Thread GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/analyst/threads/[id] - Update thread title
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (isTestMode()) {
      const mockThread: AnalystThread = {
        id: threadId,
        user_id: "test-user",
        title: title.slice(0, 100),
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

    // Update thread title (RLS will ensure user owns it)
    const { data: thread, error } = await supabase
      .from("analyst_threads")
      .update({ title: title.slice(0, 100) })
      .eq("id", threadId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      console.error("Error updating thread:", error);
      return NextResponse.json(
        { error: "Failed to update thread" },
        { status: 500 }
      );
    }

    return NextResponse.json({ thread });
  } catch (error) {
    console.error("Thread PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/analyst/threads/[id] - Delete a thread (cascades to messages)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;

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

    // Delete thread (RLS will ensure user owns it, cascade deletes messages)
    const { error } = await supabase
      .from("analyst_threads")
      .delete()
      .eq("id", threadId);

    if (error) {
      console.error("Error deleting thread:", error);
      return NextResponse.json(
        { error: "Failed to delete thread" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Thread DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
