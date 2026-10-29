import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import { getDebtSummary, recordDebtTransaction } from "@/lib/business/debt";

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

// GET /api/business/debt — current debt + recent entries.
export async function GET(): Promise<NextResponse> {
  try {
    const { supabase, user, context } = await getSessionContext();
    if (!user || !context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await getDebtSummary(supabase, context.businessAccountId);
    return NextResponse.json(summary);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to load debt";
    return NextResponse.json({ error: message }, { status });
  }
}

const postSchema = z.discriminatedUnion("mode", [
  // Set the debt to an exact value — records the signed delta needed.
  z.object({
    mode: z.literal("set"),
    amount_cents: z.number().int().min(0).max(1_000_000_000),
    note: z.string().trim().max(280).optional().nullable(),
  }),
  // Raise (positive) or pay down (negative) the debt by a signed amount.
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

// POST /api/business/debt — set or adjust the debt balance.
export async function POST(request: Request): Promise<NextResponse> {
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

    const summary = await getDebtSummary(supabase, context.businessAccountId, 1);
    if (summary.needs_migration) {
      return NextResponse.json(
        { error: "Debt ledger migration required", needs_migration: true },
        { status: 503 }
      );
    }

    let note = parsed.data.note ?? null;
    let deltaCents: number;
    if (parsed.data.mode === "set") {
      deltaCents = parsed.data.amount_cents - summary.balance_cents;
      if (!note) note = summary.initialized ? "Debt set" : "Opening debt balance";
    } else {
      deltaCents = parsed.data.amount_cents;
      if (!note) note = deltaCents > 0 ? "Debt added" : "Debt paid down";
    }

    await recordDebtTransaction({
      supabase,
      userId: user.id,
      businessAccountId: context.businessAccountId,
      amountCents: deltaCents,
      kind:
        parsed.data.mode === "set" && !summary.initialized
          ? "opening_balance"
          : "adjustment",
      note,
    });

    const refreshed = await getDebtSummary(supabase, context.businessAccountId);
    return NextResponse.json(refreshed, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to update debt";
    return NextResponse.json({ error: message }, { status });
  }
}
