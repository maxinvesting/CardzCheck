import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";

function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (isTestMode()) return true;
  return parseAdminEmails().has(email.trim().toLowerCase());
}

export async function getAdminAuth(): Promise<{
  user: { id: string; email?: string | null } | null;
  unauthorizedResponse?: NextResponse;
}> {
  if (isTestMode()) {
    return {
      user: {
        id: "test-user-id",
        email: "test@example.com",
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      unauthorizedResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      user: null,
      unauthorizedResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
  };
}
