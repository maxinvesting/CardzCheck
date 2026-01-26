import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  return NextResponse.json({
    hasSession: !!session,
    hasUser: !!user,
    sessionError: sessionError?.message || null,
    userError: userError?.message || null,
    userId: user?.id || null,
    userEmail: user?.email || null,
  });
}
