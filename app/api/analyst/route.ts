import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";

const ANALYST_QUERY_LIMIT = 100;

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

    if (message.length > 2000) {
      return NextResponse.json(
        { ok: false, error: "Message too long (max 2000 characters)", code: "MESSAGE_TOO_LONG" },
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

      // Get user record to check limits and get name for personalization
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

      // Free users get 0 analyst queries, paid users get 100
      const limit = userData?.is_paid ? ANALYST_QUERY_LIMIT : 0;
      const used = userData?.analyst_queries_used || 0;

      if (!userData?.is_paid) {
        return NextResponse.json(
          {
            ok: false,
            error: "upgrade_required",
            message: "CardzCheck Analyst is a Pro feature. Upgrade to access card analysis.",
            code: "UPGRADE_REQUIRED",
          },
          { status: 403 }
        );
      }

      if (used >= limit) {
        return NextResponse.json(
          {
            ok: false,
            error: "limit_reached",
            message: `You've used all ${ANALYST_QUERY_LIMIT} analyst queries. Contact support for more.`,
            used,
            limit,
            code: "LIMIT_REACHED",
          },
          { status: 403 }
        );
      }

      // Atomically claim one query slot before doing the expensive AI call.
      // Uses a conditional UPDATE that only increments when still under the limit,
      // preventing concurrent requests from both passing the check above.
      const { count: claimedCount } = await supabase
        .from("users")
        .update({ analyst_queries_used: used + 1 })
        .eq("id", user.id)
        .eq("analyst_queries_used", used); // optimistic lock — fails if already changed

      if (!claimedCount || claimedCount === 0) {
        // Another concurrent request already incremented; recheck limit
        return NextResponse.json(
          {
            ok: false,
            error: "limit_reached",
            message: `You've used all ${ANALYST_QUERY_LIMIT} analyst queries. Contact support for more.`,
            used,
            limit,
            code: "LIMIT_REACHED",
          },
          { status: 403 }
        );
      }

      // Slot claimed — store user info for personalization below
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
      // Sanitize all string fields: strip newlines and control characters that
      // could break prompt structure or inject rogue instructions into the
      // system prompt (prompt injection via card metadata).
      const sanitizeContextField = (val: string | undefined): string | undefined => {
        if (!val) return val;
        return val
          .replace(/[\r\n\t]/g, " ")          // collapse line breaks / tabs
          .replace(/[\x00-\x1F\x7F]/g, "")    // strip other control chars
          .slice(0, 200)                         // hard cap per field
          .trim();
      };

      const safeYear       = sanitizeContextField(cardContext.year);
      const safePlayerName = sanitizeContextField(cardContext.playerName);
      const safeSetName    = sanitizeContextField(cardContext.setName);
      const safeGrade      = sanitizeContextField(cardContext.grade);

      const cardDetails = [];
      if (safeYear) cardDetails.push(safeYear);
      if (safePlayerName) cardDetails.push(safePlayerName);
      if (safeSetName) cardDetails.push(safeSetName);
      if (safeGrade) cardDetails.push(safeGrade);

      systemPrompt += `

Current card context:
- Card: ${cardDetails.join(" ") || "Unknown card"}`;

      // Only embed numeric fields if they are actually finite numbers
      const safeAvgPrice =
        typeof cardContext.avgPrice === "number" && Number.isFinite(cardContext.avgPrice)
          ? cardContext.avgPrice
          : null;
      const safeChange30d =
        typeof cardContext.priceChange30d === "number" && Number.isFinite(cardContext.priceChange30d)
          ? cardContext.priceChange30d
          : null;

      if (safeAvgPrice !== null) {
        systemPrompt += `
- Average sale price: $${safeAvgPrice.toLocaleString()}`;
      }

      if (safeChange30d !== null) {
        systemPrompt += `
- 30-day price change: ${safeChange30d > 0 ? "+" : ""}${safeChange30d}%`;
      }

      if (cardContext.recentSales && cardContext.recentSales.length > 0) {
        const salesStr = cardContext.recentSales
          .slice(0, 5)
          .filter((s) => typeof s.price === "number" && Number.isFinite(s.price))
          .map((s) => `$${s.price}`)
          .join(", ");
        if (salesStr) systemPrompt += `
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
