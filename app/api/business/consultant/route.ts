import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessContext } from "@/lib/business/context";
import {
  listInventory,
  listSales,
  getBusinessMetrics,
} from "@/lib/business/actions";
import { buildBusinessConsultantContext } from "@/lib/business/consultant-context";
import { BUSINESS_CONSULTANT_MASTER_PROMPT } from "@/lib/ai/business-consultant-prompt";
import type { BusinessConsultation } from "@/types";
import {
  parseBusinessConsultantReport,
  type BusinessConsultantReport,
} from "@/lib/business/consultant-report";

interface ConsultantRequest {
  prompt: string;
  context?: string | null;
  template_key?: string | null;
  mode_hint?: "chat" | "report" | null;
}

const CONSULTATION_HISTORY_LIMIT = 25;
const QUICK_CAPABILITY_QUESTION_MAX_CHARS = 220;

function isQuickCapabilityQuestion(
  prompt: string,
  modeHint: ConsultantRequest["mode_hint"]
): boolean {
  if (modeHint === "report") return false;
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || normalized.length > QUICK_CAPABILITY_QUESTION_MAX_CHARS) return false;

  const startsLikeQuestion = /^(can|could|do|does|is|are|will|would|what|how)\b/.test(normalized);
  const hasQuestionSignal = normalized.includes("?") || startsLikeQuestion;
  if (!hasQuestionSignal) return false;

  const asksCapability =
    /\b(capabilit(?:y|ies)|able|support)\b/.test(normalized) ||
    /^(can|could|do|does|is|are)\b/.test(normalized);
  const asksSearchOrDeals =
    /\b(search|scan|find|look up|web|internet|deal|deals|comp|comps|price|pricing)\b/.test(
      normalized
    );

  return asksCapability && asksSearchOrDeals;
}

function shouldEnableWebSearch(prompt: string, isGradingQuestion: boolean): boolean {
  if (isGradingQuestion) return true;
  return /\b(ebay|sold|comp|comps|market|price|pricing|deal|deals|buy|acquisition|target|undervalued|search|scan|web|internet|latest|current)\b/i.test(
    prompt
  );
}

function buildQuickCapabilityReport(): BusinessConsultantReport {
  return {
    response_mode: "answer",
    report_title: "Capability Check",
    timestamp: new Date().toISOString(),
    data_coverage: {
      inventory_count: 0,
      sales_count: 0,
      missing: [],
    },
    answer:
      "Yes, I can scan the internet for deals. What should I target (card/player or product), budget, and preferred marketplaces so I can run web search?",
    key_points: [
      "Fast response mode used for a capability question.",
      "Web search runs after criteria are provided.",
    ],
    kpis: [],
    high_risk_positions: [],
    recommended_actions: [
      {
        action: "Send target, budget, and location/marketplace constraints.",
        impact: "Enables immediate, focused deal search.",
        effort: "low",
      },
    ],
    notes: ["No inventory or sales analysis was required for this question."],
  };
}

// GET /api/business/consultant - Load saved consultant history
export async function GET() {
  try {
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

    const context = await requireBusinessContext(user.id);

    const { data: consultations, error } = await supabase
      .from("business_consultations")
      .select("*")
      .eq("business_account_id", context.businessAccountId)
      .order("updated_at", { ascending: false })
      .limit(CONSULTATION_HISTORY_LIMIT);

    if (error) {
      console.error("Failed to fetch business consultations:", error);
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch consultant history",
          code: "CONSULTATION_HISTORY_ERROR",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      consultations: (consultations || []) as BusinessConsultation[],
    });
  } catch (error) {
    console.error("Business consultant history GET error:", error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load consultant history",
        message: error instanceof Error ? error.message : "Unknown error",
        code: "BUSINESS_CONSULTANT_HISTORY_ERROR",
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsultantRequest;
    const prompt = body?.prompt?.trim();
    const additionalContext = body?.context?.trim() || "";
    const templateKey = body?.template_key?.trim() || null;
    const modeHint = body?.mode_hint ?? null;

    if (!prompt) {
      return NextResponse.json(
        { ok: false, error: "Prompt is required", code: "INVALID_PROMPT" },
        { status: 400 }
      );
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

    const businessContextScope = await requireBusinessContext(user.id);

    // Detect grading questions so we can inject a stronger pre-search instruction.
    const isGradingQuestion = /grad(e|ing)|psa|bgs|sgc|slab|submit|submission|worth grading|grade roi/i.test(prompt);
    const useQuickCapabilityPath = isQuickCapabilityQuestion(prompt, modeHint);

    let report: BusinessConsultantReport | null = null;
    let consultantResponse = "Constraint: Response unavailable for this request.";
    let contextSummary: {
      inventoryItems: number;
      activeItems: number;
      totalSales: number;
      cmvCoveragePct: number;
    } = {
      inventoryItems: 0,
      activeItems: 0,
      totalSales: 0,
      cmvCoveragePct: 0,
    };

    if (useQuickCapabilityPath) {
      report = buildQuickCapabilityReport();
      consultantResponse = JSON.stringify(report);
    } else {
      const [inventory, salesResult, metrics] = await Promise.all([
        listInventory(user.id),
        listSales(user.id),
        getBusinessMetrics(user.id),
      ]);

      const businessContext = buildBusinessConsultantContext({
        inventory,
        sales: salesResult.sales,
        metrics,
      });

      contextSummary = {
        inventoryItems: businessContext.inventory_summary.total_items,
        activeItems: businessContext.inventory_summary.active_items,
        totalSales: businessContext.sales_summary.total_sales,
        cmvCoveragePct: businessContext.inventory_summary.cmv_coverage_pct,
      };

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          {
            ok: false,
            error: "Missing Anthropic API key",
            code: "MISSING_LLM_KEY",
          },
          { status: 500 }
        );
      }

      const anthropic = new Anthropic({ apiKey });
      const shouldUseWebSearch = shouldEnableWebSearch(prompt, isGradingQuestion);
      const isReportMode = modeHint === "report";
      const model = !shouldUseWebSearch && !isReportMode
        ? "claude-haiku-4-5-20251001"
        : "claude-sonnet-4-6";
      const maxTokens = isReportMode ? 4096 : shouldUseWebSearch ? 4096 : 1024;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modelRequest: any = {
        model,
        max_tokens: maxTokens,
        system: `${BUSINESS_CONSULTANT_MASTER_PROMPT}
${modeHint === "report" ? '\nMODE OVERRIDE: Always set response_mode to "report" for this request, regardless of question type.\n' : ""}
${isGradingQuestion ? '\nGRADING ANALYSIS DETECTED: You MUST execute all three mandatory web_search calls (PSA 10, PSA 9, raw sold eBay 2026) BEFORE generating any analysis or JSON output. Do not produce the final JSON until all three searches are complete and you have real sold comp data. Use the exact fee figures from the system prompt — do not estimate fees.\n' : ""}
ADDITIONAL EXECUTION RULES:
- Use only the provided BUSINESS DATA JSON.
- If a requested metric is not present in the JSON, explicitly mark it as a Constraint.
- Distinguish deterministic values from directional estimates.

RESPONSE MODE SELECTION:
- Use "answer" for: direct or conversational questions ("where", "how do I", "what should I do about X", single-topic questions, sourcing/logistics questions).
- Use "report" for: broad business analysis, inventory health reviews, liquidity/pricing/grading strategy, multi-faceted assessments, template-driven requests.

OUTPUT FORMAT (STRICT):
- Respond with a single JSON object ONLY (no markdown, no code fences, no commentary).
- The JSON MUST conform to this schema:
{
  "response_mode": "report" | "answer",
  "report_title": string,
  "timestamp": string,
  "data_coverage": { "inventory_count": number, "sales_count": number, "missing": string[] },
  "answer": string | null,
  "key_points": string[],
  "kpis": [{ "label": string, "value": string, "hint": string }],
  "high_risk_positions": [{ "item": string, "cost_basis": number, "cmv": number, "delta_pct": number, "reason": string }],
  "recommended_actions": [{ "action": string, "impact": string, "effort": "low"|"medium"|"high" }],
  "notes": string[]
}
- When response_mode is "answer": populate "answer" (direct paragraph response to the question) and "key_points" (supporting bullet points); "kpis" and "high_risk_positions" should be empty arrays.
- When response_mode is "report": populate "kpis" and "high_risk_positions" as needed; "answer" should be null and "key_points" should be an empty array.
- "recommended_actions" and "notes" may be used in both modes.
- Arrays may be empty, but all keys must be present.
- All numeric fields must be numbers (not strings).
- The JSON must be parseable with a standard JSON parser without any preprocessing.`,
        messages: [
          {
            role: "user",
            content: `BUSINESS QUESTION (PRIMARY DECISION TO ANALYZE):
${prompt}

TEMPLATE CATEGORY:
${templateKey ?? "custom"}

ADDITIONAL CONTEXT / CONSTRAINTS (OPTIONAL, PROVIDED BY USER):
${additionalContext || "None provided."}

BUSINESS DATA JSON (SOURCE OF TRUTH):
${JSON.stringify(businessContext, null, 2)}`,
          },
        ],
      };

      if (shouldUseWebSearch) {
        modelRequest.tools = [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: isGradingQuestion ? 24 : 4,
          },
        ];
      }

      const response = await anthropic.messages.create(modelRequest);

      // Filter to text blocks only — web_search_tool_result and tool_use blocks are
      // intermediate steps and should not be included in the final response text.
      const textBlocks = response.content.filter((block) => block.type === "text");
      const modelText =
        textBlocks.length > 0
          ? textBlocks
              .map((block) => (block.type === "text" ? block.text : ""))
              .join("\n")
              .trim()
          : null;

      const parsed = parseBusinessConsultantReport(modelText);
      report = parsed.report;
      consultantResponse =
        parsed.rawText && parsed.rawText.length > 0
          ? parsed.rawText
          : "Constraint: Response unavailable for this request.";
    }

    const consultationTitle =
      prompt.length > 80 ? `${prompt.slice(0, 80).trim()}...` : prompt;

    let savedConsultation: BusinessConsultation | null = null;
    let saveWarning: string | null = null;

    const { data: insertedConsultation, error: saveError } = await supabase
      .from("business_consultations")
      .insert({
        business_account_id: businessContextScope.businessAccountId,
        user_id: user.id,
        title: consultationTitle,
        prompt,
        response: consultantResponse,
        context_summary: contextSummary,
      })
      .select("*")
      .single();

    let finalSaveError = saveError;

    if (!saveError) {
      savedConsultation = insertedConsultation as BusinessConsultation;
    }

    // If RLS blocked the write, surface the error rather than retrying with service role.
    if (!savedConsultation && saveError && (saveError.code === "42501" || saveError.code === "PGRST116")) {
      console.error("[consultant] RLS blocked write — not retrying with service role", { code: saveError.code });
      return NextResponse.json({ error: "Failed to save conversation" }, { status: 500 });
    }

    if (!savedConsultation && finalSaveError) {
      console.error("Failed to save business consultation:", {
        code: finalSaveError.code,
        message: finalSaveError.message,
        details: finalSaveError.details,
      });
      if (finalSaveError.code === "42P01" || finalSaveError.code === "42703") {
        saveWarning = "Consultation history is not fully configured yet. Analysis still generated.";
      } else if (finalSaveError.code === "42501") {
        saveWarning = "Consultation history permissions prevented this save.";
      } else {
        saveWarning = "Analysis generated, but this run could not be saved to history.";
      }
    }

    return NextResponse.json({
      ok: true,
      response: consultantResponse,
      report,
      consultation: savedConsultation,
      saved: Boolean(savedConsultation),
      saveWarning,
      saveErrorCode: finalSaveError?.code ?? null,
      contextSummary,
    });
  } catch (error) {
    console.error("Business consultant error:", error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate business consultation",
        message: error instanceof Error ? error.message : "Unknown error",
        code: "BUSINESS_CONSULTANT_ERROR",
      },
      { status }
    );
  }
}
