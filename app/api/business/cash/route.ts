import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import {
  cashDeltaForSetBalance,
  getCashSummary,
  recordCashTransaction,
} from "@/lib/business/cash";

export const dynamic = "force-dynamic";

async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, context: null };
  const context = await requireBusinessAccess(user.id);
  return { supabase, user, context };
}

// GET /api/business/cash — current balance + recent transactions.
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { supabase, user, context } = await getSessionContext();
    if (!user || !context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) ? limitParam : 50;

    const summary = await getCashSummary(supabase, context.businessAccountId, limit);
    return NextResponse.json(summary);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message =
      error instanceof Error ? error.message : "Failed to load cash balance";
    return NextResponse.json({ error: message }, { status });
  }
}

const postSchema = z.discriminatedUnion("mode", [
  // Set the balance to an exact value — records the signed delta needed.
  z.object({
    mode: z.literal("set"),
    amount_cents: z.number().int().min(0).max(1_000_000_000),
    note: z.string().trim().max(280).optional().nullable(),
  }),
  // Add (positive) or remove (negative) cash by a signed amount.
  z.object({
    mode: z.literal("adjust"),
    amount_cents: z
      .number()
      .int()
      .refine((v) => v !== 0, "Amount cannot be zero")
      .refine((v) => Math.abs(v) <= 1_000_000_000, "Amount out of range"),
    note: z.string().trim().max(280).optional().nullable(),
  }),
]);

// POST /api/business/cash — set or adjust the cash balance (manual entry).
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { supabase, user, context } = await getSessionContext();
    if (!user || !context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const summary = await getCashSummary(supabase, context.businessAccountId, 1);
    if (summary.needs_migration) {
      return NextResponse.json(
        { error: "Cash ledger migration required", needs_migration: true },
        { status: 503 }
      );
    }

    let deltaCents: number;
    let kind: "opening_balance" | "adjustment";
    let note = parsed.data.note ?? null;

    if (parsed.data.mode === "set") {
      deltaCents = cashDeltaForSetBalance(
        summary.balance_cents,
        parsed.data.amount_cents
      );
      kind = summary.initialized ? "adjustment" : "opening_balance";
      if (!note) {
        note = summary.initialized
          ? "Balance set"
          : "Opening cash balance";
      }
      if (deltaCents === 0) {
        // Nothing to record — balance already matches the target.
        const refreshed = await getCashSummary(supabase, context.businessAccountId);
        return NextResponse.json(refreshed);
      }
    } else {
      deltaCents = parsed.data.amount_cents;
      kind = "adjustment";
      if (!note) note = deltaCents > 0 ? "Cash added" : "Cash removed";
    }

    await recordCashTransaction({
      supabase,
      userId: user.id,
      businessAccountId: context.businessAccountId,
      amountCents: deltaCents,
      kind,
      note,
    });

    const refreshed = await getCashSummary(supabase, context.businessAccountId);
    return NextResponse.json(refreshed, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message =
      error instanceof Error ? error.message : "Failed to update cash balance";
    return NextResponse.json({ error: message }, { status });
  }
}
