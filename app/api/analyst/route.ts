import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";
import {
  consumeWeeklyAnalystMessage,
  getTierGates,
  getWeeklyAnalystUsage,
} from "@/lib/access";

interface CardContext {
  playerName?: string;
  year?: string;
  setName?: string;
  grade?: string;
  recentSales?: Array<{ price: number; date: string }>;
  avgPrice?: number;
  priceChange30d?: number;
}

interface AnalystRequest {
  message: string;
  cardContext?: CardContext;
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalystRequest = await request.json();
    const { message, cardContext } = body;

    logDebug("🧠 Analyst request received", {
      hasMessage: Boolean(message),
      hasCardContext: Boolean(cardContext),
    });

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Message is required", code: "INVALID_MESSAGE" },
        { status: 400 }
      );
    }

    // Check authorization and usage limits
    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Bypassing analyst auth check");
    } else {
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

      // Read name only — limits are enforced by the tier gate below.
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();

      if (userError && userError.code !== "PGRST116") {
        console.error("Error fetching user:", userError);
        return NextResponse.json(
          { ok: false, error: "Failed to verify user", code: "USER_LOOKUP_FAILED" },
          { status: 500 }
        );
      }

      // Tier-based weekly cap. business = 3/wk, business_pro = unlimited.
      // Atomic: increments on success; refuses if the cap is hit.
      const gates = await getTierGates(user.id);
      const allowed = await consumeWeeklyAnalystMessage(user.id, gates.analystWeeklyLimit);
      if (!allowed) {
        const usage = await getWeeklyAnalystUsage(user.id);
        const message =
          gates.tier === "free"
            ? "CardzCheck Analyst is a paid feature. Upgrade to Business for 3 messages per week, or Business Pro for unlimited."
            : `You've used all ${gates.analystWeeklyLimit} analyst messages for this week. Upgrade to Business Pro for unlimited.`;
        return NextResponse.json(
          {
            ok: false,
            error: "limit_reached",
            message,
            used: usage.messagesUsed,
            limit: gates.analystWeeklyLimit,
            resetsAt: usage.resetsAt,
            code: gates.tier === "free" ? "UPGRADE_REQUIRED" : "WEEKLY_LIMIT_REACHED",
            upgradeRequired: true,
          },
          { status: 403 }
        );
      }

      // Store user info for later
      (request as unknown as { userId: string; userName: string | null }).userId = user.id;
      (request as unknown as { userId: string; userName: string | null }).userName = userData?.name || null;
    }

    // Get user name for personalization (from stored value or test mode)
    let userName: string | null = null;
    if (isTestMode()) {
      userName = "Test User";
    } else {
      userName = (request as unknown as { userName: string | null }).userName || null;
    }

    // Build the system prompt with card context
    let systemPrompt = `You are a trading card market analyst for CardzCheck. You help users understand card values, investment potential, and market trends across sports cards and TCG cards (including Pokemon and One Piece).

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

No specific card selected. Answer general trading card market questions.`;
    }

    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Returning mock analyst response");
      return NextResponse.json({
        ok: true,
        result: "Test mode analyst response.",
        response: "Test mode analyst response.",
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logDebug("❌ Analyst missing ANTHROPIC_API_KEY");
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Anthropic API key",
          code: "MISSING_LLM_KEY",
        },
        { status: 500 }
      );
    }

    // Call Claude Sonnet with web search for accurate, up-to-date analysis
    const anthropic = new Anthropic({
      apiKey,
    });

    // Use web search tool for real-time information
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logDebug("🧠 Analyst calling Anthropic", { hasCardContext: Boolean(cardContext) });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        } as any, // Web search tool type not yet in SDK types
      ],
      messages: [{ role: "user", content: message }],
    });

    // Extract text from the response (may include multiple content blocks with web search)
    const textBlocks = response.content.filter((block) => block.type === "text");
    const responseText = textBlocks.length > 0
      ? textBlocks.map((block) => block.type === "text" ? block.text : "").join("\n").trim()
      : "Unable to analyze at this time.";

    logDebug("✅ Analyst response received", { length: responseText.length });

    // Weekly counter already incremented atomically by
    // consumeWeeklyAnalystMessage() at the top of the handler. Legacy lifetime
    // counter (users.analyst_queries_used) is no longer the source of truth
    // and will be retired in a follow-up cleanup.

    return NextResponse.json({
      ok: true,
      result: responseText,
      response: responseText,
    });
  } catch (error) {
    console.error("Analyst error:", error);
    logDebug("❌ Analyst error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to analyze",
        message: error instanceof Error ? error.message : "Unknown error",
        code: "ANALYST_ERROR",
      },
      { status: 500 }
    );
  }
}
