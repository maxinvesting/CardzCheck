import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  // Only allow in development - block in production
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 }
    );
  }

  const supabase = await createClient();

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  return NextResponse.json({
    hasSession: !!session,
    hasUser: !!user,
    sessionError: sessionError?.message || null,
    userError: userError?.message || null,
    // Redact sensitive info even in dev
    userId: user?.id ? `${user.id.substring(0, 8)}...` : null,
    userEmail: user?.email ? `${user.email.split("@")[0].substring(0, 3)}...@${user.email.split("@")[1]}` : null,
  });
}
