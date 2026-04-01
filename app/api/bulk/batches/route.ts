/**
 * GET  /api/bulk/batches  — list user's batches (newest first)
 * POST /api/bulk/batches  — create a new batch
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: batches, error } = await supabase
    .from("bulk_batches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/bulk/batches] GET error:", error.message);
    return NextResponse.json({ error: "Failed to load batches" }, { status: 500 });
  }

  return NextResponse.json({ batches });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Batch name is required" }, { status: 400 });
  }

  if (name.length > 120) {
    return NextResponse.json({ error: "Batch name too long (max 120 characters)" }, { status: 400 });
  }

  const { data: batch, error } = await supabase
    .from("bulk_batches")
    .insert({ user_id: user.id, name, status: "pending" })
    .select()
    .single();

  if (error) {
    console.error("[api/bulk/batches] POST error:", error.message);
    return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
  }

  return NextResponse.json({ batch }, { status: 201 });
}
