import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function errorResponse(err: unknown, fallback: string): NextResponse {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : fallback;
  if (status && status < 500) return NextResponse.json({ error: message }, { status });
  const code = String((err as { code?: string })?.code ?? "");
  if (code === "PGRST205" || code === "42P01") {
    return NextResponse.json(
      { error: "Consignment migration required", needs_migration: true },
      { status: 503 }
    );
  }
  console.error(`[consignment] ${fallback}`, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export const cardSchema = z.object({
  inventory_item_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(300).optional().nullable(),
  card_number: z.string().trim().max(40).optional().nullable(),
  cost_cents: z.number().int().min(0),
  sold_price_cents: z.number().int().min(0),
});
