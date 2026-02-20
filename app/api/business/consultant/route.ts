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

interface ConsultantRequest {
  prompt: string;
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

    const [inventory, sales, metrics] = await Promise.all([
      listInventory(user.id),
      listSales(user.id),
      getBusinessMetrics(user.id),
    ]);

    const businessContext = buildBusinessConsultantContext({
      inventory,
      sales,
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
      max_tokens: 1800,
      system: `${BUSINESS_CONSULTANT_MASTER_PROMPT}

ADDITIONAL EXECUTION RULES:
- Use only the provided BUSINESS DATA JSON.
- If a requested metric is not present in the JSON, explicitly mark it as a Constraint.
- Distinguish deterministic values from directional estimates.
- Keep output structured and scannable using the required section format.`,
      messages: [
        {
          role: "user",
          content: `BUSINESS QUESTION:
${prompt}

BUSINESS DATA JSON (SOURCE OF TRUTH):
${JSON.stringify(businessContext, null, 2)}`,
        },
      ],
    });

    const textBlocks = response.content.filter((block) => block.type === "text");
    const consultantResponse =
      textBlocks.length > 0
        ? textBlocks
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("\n")
            .trim()
        : "Constraint: AI response unavailable for this request.";

    const contextSummary = {
      inventoryItems: businessContext.inventory_summary.total_items,
      activeItems: businessContext.inventory_summary.active_items,
      totalSales: businessContext.sales_summary.total_sales,
      cmvCoveragePct: businessContext.inventory_summary.cmv_coverage_pct,
    };

    const consultationTitle =
      prompt.length > 80 ? `${prompt.slice(0, 80).trim()}...` : prompt;

    let savedConsultation: BusinessConsultation | null = null;
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

    if (saveError) {
      console.error("Failed to save business consultation:", saveError);
    } else {
      savedConsultation = insertedConsultation as BusinessConsultation;
    }

    return NextResponse.json({
      ok: true,
      response: consultantResponse,
      consultation: savedConsultation,
      saved: Boolean(savedConsultation),
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
