import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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
      max_tokens: 1800,
      system: `${BUSINESS_CONSULTANT_MASTER_PROMPT}

ADDITIONAL EXECUTION RULES:
- Use only the provided BUSINESS DATA JSON.
- If a requested metric is not present in the JSON, explicitly mark it as a Constraint.
- Distinguish deterministic values from directional estimates.
- Use readable markdown headings and bullets with short paragraphs.
- Do not use separator lines (-----), boxed labels, or the term "AI" in user-facing output.`,
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

    // Retry save with service role when auth policies block insert/select on user client,
    // or when .single() gets 0 rows (PGRST116) e.g. due to RLS hiding the returned row.
    if (!savedConsultation && saveError && (saveError.code === "42501" || saveError.code === "PGRST116")) {
      try {
        const serviceSupabase = await createServiceClient();
        const { data: serviceInserted, error: serviceSaveError } = await serviceSupabase
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

        if (!serviceSaveError) {
          savedConsultation = serviceInserted as BusinessConsultation;
          finalSaveError = null;
        } else {
          finalSaveError = serviceSaveError;
          console.error("Service-role retry failed to save business consultation:", {
            code: serviceSaveError?.code,
            message: serviceSaveError?.message,
            details: serviceSaveError?.details,
          });
        }
      } catch (serviceClientError) {
        console.error("Service-role retry unavailable for business consultation save:", serviceClientError);
      }
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
