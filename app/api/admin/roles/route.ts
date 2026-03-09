import { NextRequest, NextResponse } from "next/server";
import { getOwnerAuth, type AppRole } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

const MANAGEABLE_ROLES: AppRole[] = ["member", "admin", "owner"];

function isValidRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" &&
    MANAGEABLE_ROLES.includes(value as AppRole)
  );
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

function isMissingAppRoleColumnError(
  error: { code?: string | null; message?: string | null } | null
): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("app_role");
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabase = await createServiceClient();
  const lowerEmail = email.trim().toLowerCase();

  let page = 1;
  const perPage = 100;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error("Failed to list auth users", error);
      return null;
    }

    const match = data.users.find(
      (user) => (user.email || "").trim().toLowerCase() === lowerEmail
    );

    if (match) {
      return match.id;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

export async function GET() {
  const owner = await getOwnerAuth();
  if (!owner.user) {
    return owner.unauthorizedResponse!;
  }

  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from("users")
    .select("id,email,name,app_role")
    .in("app_role", ["owner", "admin"])
    .order("app_role", { ascending: false })
    .order("email", { ascending: true });

  if (error) {
    if (isMissingAppRoleColumnError(error)) {
      return NextResponse.json(
        { error: "app_role column missing. Run latest Supabase migrations." },
        { status: 503 }
      );
    }

    console.error("Failed to fetch elevated roles", error);
    return NextResponse.json(
      { error: "Failed to load role assignments" },
      { status: 500 }
    );
  }

  return NextResponse.json({ users: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const owner = await getOwnerAuth();
  if (!owner.user) {
    return owner.unauthorizedResponse!;
  }

  const body = await request.json();
  const email = body?.email;
  const appRole = body?.app_role;

  if (!isValidEmail(email) || !isValidRole(appRole)) {
    return NextResponse.json(
      { error: "email and valid app_role are required" },
      { status: 400 }
    );
  }

  const userId = await findAuthUserIdByEmail(email);

  if (!userId) {
    return NextResponse.json(
      { error: "No auth user found for email" },
      { status: 404 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const supabase = await createServiceClient();

  if (userId === owner.user.id && appRole !== "owner") {
    return NextResponse.json(
      { error: "Owners cannot remove their own owner role." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        id: userId,
        email: normalizedEmail,
        app_role: appRole,
      },
      { onConflict: "id" }
    )
    .select("id,email,app_role")
    .single();

  if (error) {
    if (isMissingAppRoleColumnError(error)) {
      return NextResponse.json(
        { error: "app_role column missing. Run latest Supabase migrations." },
        { status: 503 }
      );
    }

    console.error("Failed to update app role", error);
    return NextResponse.json(
      { error: "Failed to update app role" },
      { status: 500 }
    );
  }

  return NextResponse.json({ user: data });
}
