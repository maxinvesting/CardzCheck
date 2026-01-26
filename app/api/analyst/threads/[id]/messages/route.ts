import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import type { AnalystThreadMessage, CardContext, CollectionItem, WatchlistItem } from "@/types";
import { SupabaseClient } from "@supabase/supabase-js";

const ANALYST_QUERY_LIMIT = 100;

interface CollectionContext {
  totalCards: number;
  totalInvested: number;
  topCards: Array<{ name: string; price: number | null }>;
  watchlistCount: number;
  watchlistItems: Array<{ name: string; lastPrice: number | null; targetPrice: number | null }>;
}

async function getCollectionContext(
  supabase: SupabaseClient,
  userId: string
): Promise<CollectionContext | null> {
  try {
    // Fetch collection items
    const { data: collection } = await supabase
      .from("collection_items")
      .select("*")
      .eq("user_id", userId)
      .order("purchase_price", { ascending: false, nullsFirst: false });

    // Fetch watchlist items
    const { data: watchlist } = await supabase
      .from("watchlist")
      .select("*")
      .eq("user_id", userId)
      .order("last_price", { ascending: false, nullsFirst: false });

    if (!collection && !watchlist) {
      return null;
    }

    const collectionItems = (collection || []) as CollectionItem[];
    const watchlistItems = (watchlist || []) as WatchlistItem[];

    // Calculate totals
    const totalCards = collectionItems.length;
    const totalInvested = collectionItems.reduce(
      (sum, item) => sum + (item.purchase_price || 0),
      0
    );

    // Get top 5 cards by purchase price
    const topCards = collectionItems
      .filter((item) => item.purchase_price !== null)
      .slice(0, 5)
      .map((item) => ({
        name: `${item.year || ""} ${item.player_name} ${item.set_name || ""} ${item.grade || ""}`.trim(),
        price: item.purchase_price,
      }));

    // Get watchlist summary
    const watchlistSummary = watchlistItems.slice(0, 5).map((item) => ({
      name: `${item.year || ""} ${item.player_name} ${item.set_brand || ""}`.trim(),
      lastPrice: item.last_price,
      targetPrice: item.target_price,
    }));

    return {
      totalCards,
      totalInvested,
      topCards,
      watchlistCount: watchlistItems.length,
      watchlistItems: watchlistSummary,
    };
  } catch (error) {
    console.error("Error fetching collection context:", error);
    return null;
  }
}

function formatCollectionForPrompt(context: CollectionContext | null): string {
  if (!context || (context.totalCards === 0 && context.watchlistCount === 0)) {
    return "\n\nThe user has not added any cards to their collection or watchlist yet.";
  }

  let prompt = "\n\nUSER'S COLLECTION DATA:";

  if (context.totalCards > 0) {
    prompt += `\n- Total cards in collection: ${context.totalCards}`;
    prompt += `\n- Total invested: $${context.totalInvested.toLocaleString()}`;

    if (context.topCards.length > 0) {
      prompt += "\n- Top cards by value:";
      context.topCards.forEach((card, i) => {
        prompt += `\n  ${i + 1}. ${card.name}${card.price ? ` ($${card.price.toLocaleString()})` : ""}`;
      });
    }
  }

  if (context.watchlistCount > 0) {
    prompt += `\n\nUSER'S WATCHLIST:`;
    prompt += `\n- ${context.watchlistCount} cards being tracked`;

    if (context.watchlistItems.length > 0) {
      prompt += "\n- Watching:";
      context.watchlistItems.forEach((item) => {
        let line = `\n  - ${item.name}`;
        if (item.lastPrice) line += ` (last: $${item.lastPrice.toLocaleString()})`;
        if (item.targetPrice) line += ` [target: $${item.targetPrice.toLocaleString()}]`;
        prompt += line;
      });
    }
  }

  prompt += "\n\nUse this collection data to personalize your responses when the user asks about their cards, portfolio performance, or buying/selling recommendations.";

  return prompt;
}

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

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
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
        userMessage: mockUserMessage,
        assistantMessage: mockAssistantMessage,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user owns the thread and is a paid user
    const { data: thread, error: threadError } = await supabase
      .from("analyst_threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
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
        { error: "Failed to verify user" },
        { status: 500 }
      );
    }

    if (!userData?.is_paid) {
      return NextResponse.json(
        {
          error: "upgrade_required",
          message: "Analyst is a Pro feature. Upgrade to access AI analysis.",
        },
        { status: 403 }
      );
    }

    const used = userData?.analyst_queries_used || 0;
    if (used >= ANALYST_QUERY_LIMIT) {
      return NextResponse.json(
        {
          error: "limit_reached",
          message: `You've used all ${ANALYST_QUERY_LIMIT} analyst queries. Contact support for more.`,
          used,
          limit: ANALYST_QUERY_LIMIT,
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
        { error: "Failed to save message" },
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

    // Build system prompt
    const userName = userData?.name || null;
    let systemPrompt = `You are a sports card market analyst for CardzCheck. You help users understand card values, investment potential, and market trends.

${userName ? `The user's name is ${userName}. Address them by name when appropriate, but don't overuse it - keep it natural and conversational.` : ""}

Guidelines:
- Keep responses concise (3-5 sentences max) and scannable
- Be direct, conversational, and actionable
- If asked about authentication or counterfeits, recommend professional grading services (PSA, BGS, SGC)
- Never guarantee investment returns - cards are speculative investments
- Use web search to verify current player stats, team rosters, recent performance, and market trends before making recommendations
- When discussing specific players, always search for their current status and recent performance first

STYLE GUIDE FOR MARKET DATA (IMPORTANT):
- Use ranges instead of exact figures: "mid-five figures" not "$35,100", "low four figures" not "$1,200"
- Say "multiple recent sales" or "strong recent activity" instead of exact counts like "13 sales"
- Use directional language: "trending up", "cooling off", "holding steady", "seeing increased demand"
- Focus on liquidity and entry points: "good liquidity under $X", "entry-level options available"
- Add risk context naturally: "volatile tied to on-field performance", "prices can swing weekly"
- Avoid absolute claims like "most graded" unless citing a specific source
- Keep it human - write like a knowledgeable friend, not a legal document
- End with actionable takeaway when relevant: what to watch for, when to buy, risk to consider`;

    if (cardContext) {
      const cardDetails = [];
      if (cardContext.year) cardDetails.push(cardContext.year);
      if (cardContext.playerName) cardDetails.push(cardContext.playerName);
      if (cardContext.setName) cardDetails.push(cardContext.setName);
      if (cardContext.grade) cardDetails.push(cardContext.grade);

      systemPrompt += `

Current card context:
- Card: ${cardDetails.join(" ") || "Unknown card"}`;

      if (cardContext.avgPrice !== undefined) {
        systemPrompt += `
- Average sale price: $${cardContext.avgPrice.toLocaleString()}`;
      }

      if (cardContext.priceChange30d !== undefined) {
        systemPrompt += `
- 30-day price change: ${cardContext.priceChange30d > 0 ? "+" : ""}${cardContext.priceChange30d}%`;
      }

      if (cardContext.recentSales && cardContext.recentSales.length > 0) {
        const salesStr = cardContext.recentSales
          .slice(0, 5)
          .map((s) => `$${s.price}`)
          .join(", ");
        systemPrompt += `
- Recent sales: ${salesStr}`;
      }
    } else {
      systemPrompt += `

No specific card selected. Answer general sports card market questions.`;
    }

    // Fetch and inject user's collection context
    const collectionContext = await getCollectionContext(supabase, user.id);
    systemPrompt += formatCollectionForPrompt(collectionContext);

    // Call Claude with conversation history
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      messages: conversationHistory,
    });

    // Extract text from response
    const textBlocks = response.content.filter((block) => block.type === "text");
    const responseText = textBlocks.length > 0
      ? textBlocks.map((block) => block.type === "text" ? block.text : "").join("\n").trim()
      : "Unable to analyze at this time.";

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
      userMessage: savedUserMessage,
      assistantMessage: savedAssistantMessage,
    });
  } catch (error) {
    console.error("Messages POST error:", error);
    return NextResponse.json(
      {
        error: "Failed to process message",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
