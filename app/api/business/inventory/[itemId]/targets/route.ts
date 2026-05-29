import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess, getInventoryItem } from "@/lib/business/actions";

type RouteContext = { params: Promise<{ itemId: string }> };

const VALID_KINDS = ["sell_price", "flip_by", "hold_until", "custom"] as const;
type TargetKind = (typeof VALID_KINDS)[number];

function isTargetKind(value: unknown): value is TargetKind {
  return typeof value === "string" && (VALID_KINDS as readonly string[]).includes(value);
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

function parseCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { itemId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inventory = await getInventoryItem(user.id, itemId);
  if (!inventory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("business_card_targets")
    .select("*")
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ targets: data ?? [] });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { itemId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inventory = await getInventoryItem(user.id, itemId);
  if (!inventory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const context = await requireBusinessAccess(user.id);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const kind = isTargetKind(body.kind) ? body.kind : null;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!kind) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Description required" }, { status: 400 });

  const target_price_cents = parseCents(body.target_price_cents);
  const target_date = parseDate(body.target_date);

  const { data, error } = await supabase
    .from("business_card_targets")
    .insert({
      user_id: user.id,
      business_account_id: context.businessAccountId,
      inventory_item_id: itemId,
      kind,
      description,
      target_price_cents,
      target_date,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ target: data });
}
