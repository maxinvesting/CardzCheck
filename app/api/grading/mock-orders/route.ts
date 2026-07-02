import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";

/**
 * Mock grading submission builder / order tracker.
 *
 * One row per order in `grading_mock_orders`. The whole order (grading company,
 * turnaround, per-card cost, shipping, and the card line items) is stored as a
 * single JSONB `data` document so the client can sync it as one object. There is
 * no AI grade prediction here — risk/reward is derived from user-entered cost
 * basis + estimated graded value.
 */

const ORDER_COLUMNS = "id,scope,name,status,data,created_at,updated_at";

const VALID_SCOPES = new Set(["personal", "business"]);
const VALID_STATUSES = new Set([
  "draft",
  "submitted",
  "grading",
  "returned",
  "completed",
  "canceled",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: NextRequest) {
  if (isTestMode()) {
    return NextResponse.json({ orders: [] });
  }

  try {
    const { supabase, user } = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = request.nextUrl.searchParams.get("scope");

    let query = supabase
      .from("grading_mock_orders")
      .select(ORDER_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (scope && VALID_SCOPES.has(scope)) {
      query = query.eq("scope", scope);
    }

    const { data, error } = await query;

    if (error) {
      // Table not yet migrated on this environment — degrade gracefully.
      if (error.code === "42P01") {
        return NextResponse.json({ orders: [], feature_unavailable: true });
      }
      console.error("grading_mock_orders.get_failed", error);
      return NextResponse.json(
        { error: "Failed to load grading orders" },
        { status: 500 }
      );
    }

    return NextResponse.json({ orders: data ?? [] });
  } catch (error) {
    console.error("grading_mock_orders.get_exception", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isTestMode()) {
    const now = new Date().toISOString();
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({
      order: {
        id: `test-order-${Date.now()}`,
        scope: body?.scope === "business" ? "business" : "personal",
        name: typeof body?.name === "string" ? body.name : "Test order",
        status: "draft",
        data: isPlainObject(body?.data) ? body.data : {},
        created_at: now,
        updated_at: now,
      },
    });
  }

  try {
    const { supabase, user } = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Order name is required" }, { status: 400 });
    }

    const scope =
      typeof body.scope === "string" && VALID_SCOPES.has(body.scope)
        ? body.scope
        : "personal";
    const status =
      typeof body.status === "string" && VALID_STATUSES.has(body.status)
        ? body.status
        : "draft";
    const data = isPlainObject(body.data) ? body.data : {};

    const { data: row, error } = await supabase
      .from("grading_mock_orders")
      .insert({ user_id: user.id, scope, name, status, data })
      .select(ORDER_COLUMNS)
      .single();

    if (error || !row) {
      if (error?.code === "42P01") {
        return NextResponse.json(
          { error: "feature_unavailable" },
          { status: 503 }
        );
      }
      console.error("grading_mock_orders.post_failed", error);
      return NextResponse.json(
        { error: "Failed to create grading order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ order: row });
  } catch (error) {
    console.error("grading_mock_orders.post_exception", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (isTestMode()) {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ order: { id: body?.id ?? "test", ...body } });
  }

  try {
    const { supabase, user } = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!isPlainObject(body) || typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "Order id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.status === "string") {
      if (!VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (isPlainObject(body.data)) {
      updates.data = body.data;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const { data: row, error } = await supabase
      .from("grading_mock_orders")
      .update(updates)
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select(ORDER_COLUMNS)
      .single();

    if (error || !row) {
      console.error("grading_mock_orders.patch_failed", error);
      return NextResponse.json(
        { error: "Failed to update grading order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ order: row });
  } catch (error) {
    console.error("grading_mock_orders.patch_exception", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (isTestMode()) {
    return NextResponse.json({ deleted: true });
  }

  try {
    const { supabase, user } = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id =
      request.nextUrl.searchParams.get("id") ??
      (await request
        .json()
        .then((b) => (isPlainObject(b) && typeof b.id === "string" ? b.id : null))
        .catch(() => null));

    if (!id) {
      return NextResponse.json({ error: "Order id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("grading_mock_orders")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("grading_mock_orders.delete_failed", error);
      return NextResponse.json(
        { error: "Failed to delete grading order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("grading_mock_orders.delete_exception", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
