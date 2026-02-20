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

interface ConsultantRequest {
  prompt: string;
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

    return NextResponse.json({
      ok: true,
      response: consultantResponse,
      contextSummary: {
        inventoryItems: businessContext.inventory_summary.total_items,
        activeItems: businessContext.inventory_summary.active_items,
        totalSales: businessContext.sales_summary.total_sales,
        cmvCoveragePct: businessContext.inventory_summary.cmv_coverage_pct,
      },
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
