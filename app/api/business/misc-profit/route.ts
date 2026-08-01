import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";

const SELECT = "id, occurred_at, amount_cents, label, created_at";

function isMissingSchema(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return code === "PGRST205" || code === "42P01" || message.includes("business_misc_profit");
}

const createSchema = z.object({
  // Dollars in the request; converted to integer cents here.
  amount: z.number().finite(),
  occurred_at: z.string().trim().min(1).optional(),
  label: z.string().trim().max(200).optional().nullable(),
});

function normalizeDate(value: string | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const context = await requireBusinessAccess(user.id);

    const { data, error } = await supabase
      .from("business_misc_profit")
      .select(SELECT)
      .eq("business_account_id", context.businessAccountId)
      .order("occurred_at", { ascending: false })
      .limit(500);

    if (error) {
      if (isMissingSchema(error)) return NextResponse.json({ entries: [] });
      throw error;
    }
    return NextResponse.json({ entries: data ?? [] });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to load misc profit";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const context = await requireBusinessAccess(user.id);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const amountCents = Math.round(parsed.data.amount * 100);
    if (amountCents === 0) {
      return NextResponse.json({ error: "Amount can't be $0." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("business_misc_profit")
      .insert({
        user_id: user.id,
        business_account_id: context.businessAccountId,
        occurred_at: normalizeDate(parsed.data.occurred_at),
        amount_cents: amountCents,
        label: parsed.data.label?.trim() || null,
      })
      .select(SELECT)
      .single();

    if (error) {
      if (isMissingSchema(error)) {
        return NextResponse.json(
          { error: "Misc-profit migration required", needs_migration: true },
          { status: 503 }
        );
      }
      throw error;
    }
    return NextResponse.json({ entry: data });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to add misc profit";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const context = await requireBusinessAccess(user.id);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await supabase
      .from("business_misc_profit")
      .delete()
      .eq("id", id)
      .eq("business_account_id", context.businessAccountId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to delete misc profit";
    return NextResponse.json({ error: message }, { status });
  }
}
