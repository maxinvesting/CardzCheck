import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";

export type AppRole = "member" | "admin" | "owner";

function parseBootstrapAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  );
}

function isBootstrapAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseBootstrapAdminEmails().has(email.trim().toLowerCase());
}

function isMissingAppRoleColumnError(
  error: { code?: string | null; message?: string | null } | null
): boolean {
  if (!error) return false;

  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();

  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("app_role")
  );
}

function normalizeRole(value: unknown): AppRole | null {
  if (value === "owner" || value === "admin" || value === "member") {
    return value;
  }

  return null;
}

function isElevatedRole(role: AppRole | null): boolean {
  return role === "owner" || role === "admin";
}

async function getUserRole(userId: string): Promise<AppRole | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("app_role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingAppRoleColumnError(error)) {
      return null;
    }

    console.error("Failed to load app role", error);
    return null;
  }

  return normalizeRole(data?.app_role);
}

export interface AdminAuthUser {
  id: string;
  email?: string | null;
  appRole: AppRole;
}

export async function getAdminAuth(): Promise<{
  user: AdminAuthUser | null;
  unauthorizedResponse?: NextResponse;
}> {
  if (isTestMode()) {
    return {
      user: {
        id: "test-user-id",
        email: "test@example.com",
        appRole: "owner",
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
      unauthorizedResponse: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const role = await getUserRole(user.id);
  const bootstrapAdmin = isBootstrapAdminEmail(user.email);
  const allowed = isElevatedRole(role) || bootstrapAdmin;

  if (!allowed) {
    return {
      user: null,
      unauthorizedResponse: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      appRole: role ?? (bootstrapAdmin ? "owner" : "member"),
    },
  };
}

export async function getOwnerAuth(): Promise<{
  user: AdminAuthUser | null;
  unauthorizedResponse?: NextResponse;
}> {
  const admin = await getAdminAuth();

  if (!admin.user) {
    return admin;
  }

  if (admin.user.appRole === "owner") {
    return admin;
  }

  const isBootstrapOwner = isBootstrapAdminEmail(admin.user.email);
  if (isBootstrapOwner) {
    return {
      user: {
        ...admin.user,
        appRole: "owner",
      },
    };
  }

  return {
    user: null,
    unauthorizedResponse: NextResponse.json(
      { error: "Owner role required" },
      { status: 403 }
    ),
  };
}
