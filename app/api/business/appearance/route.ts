import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  businessAppearanceFromRow,
  businessAppearanceToRow,
  DEFAULT_BUSINESS_APPEARANCE,
  parseBusinessAppearanceInput,
} from "@/lib/business/appearance";
import {
  requireBusinessContext,
  requireBusinessOwnerContext,
} from "@/lib/business/context";
import { isTestMode } from "@/lib/test-mode";

function toStatus(error: unknown, fallback = 500): number {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === "number" ? status : fallback;
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function GET(): Promise<NextResponse> {
  try {
    if (isTestMode()) {
      return NextResponse.json({
        ...DEFAULT_BUSINESS_APPEARANCE,
        canEdit: true,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await requireBusinessContext(user.id);
    const service = await createServiceClient();
    const { data, error } = await service
      .from("business_accounts")
      .select(
        "appearance_primary_color, appearance_secondary_color, appearance_tertiary_color"
      )
      .eq("id", context.businessAccountId)
      .single();

    if (error) {
      throw error;
    }

    const appearance = businessAppearanceFromRow(data ?? null);
    return NextResponse.json({
      ...appearance,
      canEdit: context.role === "owner",
    });
  } catch (error) {
    return NextResponse.json(
      { error: toMessage(error, "Failed to load business appearance") },
      { status: toStatus(error) }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    if (isTestMode()) {
      const body = await request.json().catch(() => ({}));
      const parsed = parseBusinessAppearanceInput(body);
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }

      return NextResponse.json({
        ...parsed.appearance,
        canEdit: true,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await requireBusinessOwnerContext(user.id);
    const parsed = parseBusinessAppearanceInput(await request.json());

    if (parsed.error || !parsed.appearance) {
      return NextResponse.json(
        { error: parsed.error ?? "Invalid appearance payload" },
        { status: 400 }
      );
    }

    const service = await createServiceClient();
    const { data, error } = await service
      .from("business_accounts")
      .update(businessAppearanceToRow(parsed.appearance))
      .eq("id", context.businessAccountId)
      .select(
        "appearance_primary_color, appearance_secondary_color, appearance_tertiary_color"
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ...businessAppearanceFromRow(data ?? null),
      canEdit: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: toMessage(error, "Failed to update business appearance") },
      { status: toStatus(error) }
    );
  }
}
