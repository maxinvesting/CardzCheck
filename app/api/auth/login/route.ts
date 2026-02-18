import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getMissingSupabasePublicEnvMessage,
  getSupabasePublicEnv,
} from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };
const AUTH_TIMEOUT_MS = 10000;

function createErrorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function mapAuthFailureToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to sign in right now. Please try again.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("enotfound") ||
    normalized.includes("could not resolve") ||
    normalized.includes("fetch failed")
  ) {
    return createErrorResponse(
      "Auth service is currently unreachable. Please check your network/DNS and try again.",
      503
    );
  }

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return createErrorResponse("Auth service timed out. Please try again.", 504);
  }

  if (
    normalized.includes("url and key are required") ||
    normalized.includes("supabaseurl is required") ||
    normalized.includes("supabasekey is required") ||
    normalized.includes("env vars are missing")
  ) {
    return createErrorResponse(getMissingSupabasePublicEnvMessage(), 503);
  }

  return createErrorResponse("Unable to sign in right now. Please try again.", 500);
}

export async function POST(request: NextRequest) {
  const cookiesToSet: CookieToSet[] = [];

  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return createErrorResponse("Email and password are required.", 400);
    }

    const supabasePublicEnv = getSupabasePublicEnv();
    if (!supabasePublicEnv) {
      return createErrorResponse(getMissingSupabasePublicEnvMessage(), 503);
    }

    const supabase = createServerClient(
      supabasePublicEnv.url,
      supabasePublicEnv.anonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(incoming: CookieToSet[]) {
            cookiesToSet.push(...incoming);
          },
        },
      }
    );

    const authPromise = supabase.auth.signInWithPassword({ email, password });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Auth request timed out."));
      }, AUTH_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([authPromise, timeoutPromise]);

    if (error) {
      return createErrorResponse(error.message, 401);
    }

    const successResponse = NextResponse.json({
      success: true,
      hasSession: !!data.session,
      hasUser: !!data.user,
    });
    cookiesToSet.forEach(({ name, value, options }) => {
      successResponse.cookies.set(name, value, options);
    });
    return successResponse;
  } catch (error) {
    return mapAuthFailureToResponse(error);
  }
}
