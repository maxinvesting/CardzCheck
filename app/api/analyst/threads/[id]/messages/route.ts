import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import type { AnalystThreadMessage, CardContext } from "@/types";
import { getUserContextForAI } from "@/lib/ai/getUserContextForAI";
import { buildAnalystPrompt } from "@/lib/ai/buildAnalystPrompt";
import { logDebug } from "@/lib/logging";

const ANALYST_QUERY_LIMIT = 100;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface MessageRequest {
  message: string;
  cardContext?: CardContext;
}

// POST /api/analyst/threads/[id]/messages - Send a message and get AI response
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;
    const body: MessageRequest = await request.json();
    const { message, cardContext } = body;

    logDebug("🧠 Analyst thread message received", {
      threadId,
      hasMessage: Boolean(message),
      hasCardContext: Boolean(cardContext),
    });

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Message is required", code: "INVALID_MESSAGE" },
        { status: 400 }
      );
    }

    const userMessage = message.trim();

    if (isTestMode()) {
      const now = new Date().toISOString();
      const mockUserMessage: AnalystThreadMessage = {
        id: `msg-${Date.now()}-user`,
        thread_id: threadId,
        user_id: "test-user",
        role: "user",
        content: userMessage,
        created_at: now,
      };
      const mockAssistantMessage: AnalystThreadMessage = {
        id: `msg-${Date.now()}-assistant`,
        thread_id: threadId,
        user_id: "test-user",
        role: "assistant",
        content: "This is a test response from the Analyst. In production, this would be an AI-generated response about sports cards.",
        created_at: now,
      };
      return NextResponse.json({
        ok: true,
        result: mockAssistantMessage.content,
        userMessage: mockUserMessage,
        assistantMessage: mockAssistantMessage,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Verify user owns the thread and is a paid user
    const { data: thread, error: threadError } = await supabase
      .from("analyst_threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { ok: false, error: "Thread not found", code: "THREAD_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Get user data for limit checking and personalization
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("is_paid, analyst_queries_used, name")
      .eq("id", user.id)
      .single();

    if (userError && userError.code !== "PGRST116") {
      console.error("Error fetching user:", userError);
      return NextResponse.json(
        { ok: false, error: "Failed to verify user", code: "USER_LOOKUP_FAILED" },
        { status: 500 }
      );
    }

    if (!userData?.is_paid) {
      return NextResponse.json(
        {
          ok: false,
          error: "upgrade_required",
          message: "Analyst is a Pro feature. Upgrade to access AI analysis.",
          code: "UPGRADE_REQUIRED",
        },
        { status: 403 }
      );
    }

    const used = userData?.analyst_queries_used || 0;
    if (used >= ANALYST_QUERY_LIMIT) {
      return NextResponse.json(
        {
          ok: false,
          error: "limit_reached",
          message: `You've used all ${ANALYST_QUERY_LIMIT} analyst queries. Contact support for more.`,
          used,
          limit: ANALYST_QUERY_LIMIT,
          code: "LIMIT_REACHED",
        },
        { status: 403 }
      );
    }

    // Insert user message
    const { data: savedUserMessage, error: userMsgError } = await supabase
      .from("analyst_messages")
      .insert({
        thread_id: threadId,
        user_id: user.id,
        role: "user",
        content: userMessage,
      })
      .select()
      .single();

    if (userMsgError) {
      console.error("Error saving user message:", userMsgError);
      return NextResponse.json(
        { ok: false, error: "Failed to save message", code: "SAVE_MESSAGE_FAILED" },
        { status: 500 }
      );
    }

    // Fetch conversation history for context
    const { data: existingMessages } = await supabase
      .from("analyst_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    // Build conversation history for Claude
    const conversationHistory = (existingMessages || []).map((msg: { role: string; content: string }) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    const userName = userData?.name || null;

    // Build shared user AI context (collection + watchlist + recent searches)
    const userContext = await getUserContextForAI(user.id);

    const cardContextText = cardContext
      ? [
          cardContext.year,
          cardContext.playerName,
          cardContext.setName,
          cardContext.grade,
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

    const { system: systemPrompt, messages: modelMessages } = buildAnalystPrompt({
      userMessage,
      userName,
      cardContextText,
      userContext,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logDebug("❌ Analyst thread missing ANTHROPIC_API_KEY");
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Anthropic API key",
          code: "MISSING_LLM_KEY",
        },
        { status: 500 }
      );
    }

    // Call Claude with conversation history
    const anthropic = new Anthropic({
      apiKey,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logDebug("🧠 Analyst thread calling Anthropic", { threadId });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        } as any,
      ],
      messages: conversationHistory.length ? conversationHistory : modelMessages,
    });

    // Extract text from response
    const textBlocks = response.content.filter((block) => block.type === "text");
    const responseText = textBlocks.length > 0
      ? textBlocks.map((block) => block.type === "text" ? block.text : "").join("\n").trim()
      : "Unable to analyze at this time.";

    logDebug("✅ Analyst thread response received", {
      threadId,
      length: responseText.length,
    });

    // Insert assistant message
    const { data: savedAssistantMessage, error: assistantMsgError } = await supabase
      .from("analyst_messages")
      .insert({
        thread_id: threadId,
        user_id: user.id,
        role: "assistant",
        content: responseText,
      })
      .select()
      .single();

    if (assistantMsgError) {
      console.error("Error saving assistant message:", assistantMsgError);
      // Continue even if save fails - user already saw the response
    }

    // Update thread's updated_at (trigger should handle this, but explicit update ensures it)
    await supabase
      .from("analyst_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    // Auto-generate title from first user message if title is still "New Chat"
    if (thread.title === "New Chat") {
      const newTitle = userMessage.length > 40
        ? userMessage.substring(0, 40) + "..."
        : userMessage;

      await supabase
        .from("analyst_threads")
        .update({ title: newTitle })
        .eq("id", threadId);
    }

    // Increment analyst query usage
    await supabase
      .from("users")
      .update({ analyst_queries_used: used + 1 })
      .eq("id", user.id);

    return NextResponse.json({
      ok: true,
      result: responseText,
      userMessage: savedUserMessage,
      assistantMessage: savedAssistantMessage,
    });
  } catch (error) {
    console.error("Messages POST error:", error);
    logDebug("❌ Analyst thread error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to process message",
        message: error instanceof Error ? error.message : "Unknown error",
        code: "ANALYST_MESSAGE_ERROR",
      },
      { status: 500 }
    );
  }
}
