import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { hasBusinessAccess } from "@/lib/access";
import {
  listInventory,
  listSales,
  getBusinessMetrics,
} from "@/lib/business/actions";
import { buildBusinessConsultantContext } from "@/lib/business/consultant-context";
import { BUSINESS_CONSULTANT_MASTER_PROMPT } from "@/lib/ai/business-consultant-prompt";
import type { BusinessConsultation } from "@/types";
import { parseBusinessConsultantReport } from "@/lib/business/consultant-report";

interface ConsultantRequest {
  prompt: string;
  context?: string | null;
  template_key?: string | null;
}

const CONSULTATION_HISTORY_LIMIT = 25;

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

    const businessAccess = await hasBusinessAccess(user.id);
    if (!businessAccess) {
      return NextResponse.json(
        {
          ok: false,
          error: "Business subscription required",
          code: "BUSINESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const { data: consultations, error } = await supabase
      .from("business_consultations")
      .select("*")
      .eq("user_id", user.id)
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
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load consultant history",
        message: error instanceof Error ? error.message : "Unknown error",
        code: "BUSINESS_CONSULTANT_HISTORY_ERROR",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsultantRequest;
    const prompt = body?.prompt?.trim();
    const context = body?.context?.trim() || "";
    const templateKey = body?.template_key?.trim() || null;

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

    const businessAccess = await hasBusinessAccess(user.id);
    if (!businessAccess) {
      return NextResponse.json(
        {
          ok: false,
          error: "Business subscription required",
          code: "BUSINESS_REQUIRED",
        },
        { status: 403 }
      );
    }

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

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
      system: `${BUSINESS_CONSULTANT_MASTER_PROMPT}

ADDITIONAL EXECUTION RULES:
- Use only the provided BUSINESS DATA JSON.
- If a requested metric is not present in the JSON, explicitly mark it as a Constraint.
- Distinguish deterministic values from directional estimates.

OUTPUT FORMAT (STRICT):
- Respond with a single JSON object ONLY (no markdown, no code fences, no commentary).
- The JSON MUST conform to this schema:
{
  "report_title": string,
  "timestamp": string,
  "data_coverage": { "inventory_count": number, "sales_count": number, "missing": string[] },
  "kpis": [{ "label": string, "value": string, "hint": string }],
  "high_risk_positions": [{ "item": string, "cost_basis": number, "cmv": number, "delta_pct": number, "reason": string }],
  "recommended_actions": [{ "action": string, "impact": string, "effort": "low"|"medium"|"high" }],
  "notes": string[]
}
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
${context || "None provided."}

BUSINESS DATA JSON (SOURCE OF TRUTH):
${JSON.stringify(businessContext, null, 2)}`,
        },
      ],
    });

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

    const { report, rawText } = parseBusinessConsultantReport(modelText);
    const consultantResponse =
      rawText && rawText.length > 0
        ? rawText
        : "Constraint: Response unavailable for this request.";

    const contextSummary = {
      inventoryItems: businessContext.inventory_summary.total_items,
      activeItems: businessContext.inventory_summary.active_items,
      totalSales: businessContext.sales_summary.total_sales,
      cmvCoveragePct: businessContext.inventory_summary.cmv_coverage_pct,
    };

    const consultationTitle =
      prompt.length > 80 ? `${prompt.slice(0, 80).trim()}...` : prompt;

    let savedConsultation: BusinessConsultation | null = null;
    let saveWarning: string | null = null;

    const { data: insertedConsultation, error: saveError } = await supabase
      .from("business_consultations")
      .insert({
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
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate business consultation",
        message: error instanceof Error ? error.message : "Unknown error",
        code: "BUSINESS_CONSULTANT_ERROR",
      },
      { status: 500 }
    );
  }
}
