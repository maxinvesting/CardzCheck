import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  return createErrorResponse("Unable to sign in right now. Please try again.", 500);
}

export async function POST(request: NextRequest) {
  let response = NextResponse.json({ ok: true });

  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return createErrorResponse("Email and password are required.", 400);
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
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
      const errorResponse = createErrorResponse(error.message, 401);
      response.cookies.getAll().forEach((cookie) => {
        errorResponse.cookies.set(cookie);
      });
      return errorResponse;
    }

    const successResponse = NextResponse.json({
      success: true,
      hasSession: !!data.session,
      hasUser: !!data.user,
    });
    response.cookies.getAll().forEach((cookie) => {
      successResponse.cookies.set(cookie);
    });
    return successResponse;
  } catch (error) {
    return mapAuthFailureToResponse(error);
  }
}
