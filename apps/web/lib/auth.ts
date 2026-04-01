import { NextResponse } from "next/server";
import { getRequestSupabase } from "./supabase";

export type AppRole = "admin" | "user";

export type CurrentUserWithRole = {
  userId: string;
  email: string | null;
  role: AppRole;
  walletAddress: string | null;
};

type UserProfileRow = {
  id: string;
  role: string | null;
  app_role?: string | null;
  wallet_address?: string | null;
};

type CookieMap = Map<string, string>;

type RequireAdminResult =
  | {
      ok: true;
      user: CurrentUserWithRole;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  const headerToken = request.headers.get("x-supabase-access-token");
  if (headerToken) {
    return headerToken.trim();
  }

  return null;
}

function parseCookieHeader(cookieHeader: string | null): CookieMap {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    cookies.set(key, value);
  }

  return cookies;
}

function looksLikeJwt(value: string): boolean {
  return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value);
}

function decodeBase64(value: string): string | null {
  try {
    return globalThis.atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
}

function extractTokenFromSessionValue(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = decodeURIComponent(value).trim();
    if (!normalized) {
      return null;
    }

    if (looksLikeJwt(normalized)) {
      return normalized;
    }

    const candidates = normalized.startsWith("base64-")
      ? [normalized.slice("base64-".length)]
      : [normalized];

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const token = extractTokenFromSessionValue(parsed);
        if (token) {
          return token;
        }
      } catch {
        const decoded = decodeBase64(candidate);
        if (!decoded) {
          continue;
        }

        if (looksLikeJwt(decoded)) {
          return decoded;
        }

        try {
          const parsed = JSON.parse(decoded) as unknown;
          const token = extractTokenFromSessionValue(parsed);
          if (token) {
            return token;
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const token = extractTokenFromSessionValue(item);
      if (token) {
        return token;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const maybeSession = value as {
      access_token?: unknown;
      currentSession?: unknown;
      session?: unknown;
    };

    if (typeof maybeSession.access_token === "string" && looksLikeJwt(maybeSession.access_token)) {
      return maybeSession.access_token;
    }

    return (
      extractTokenFromSessionValue(maybeSession.currentSession) ??
      extractTokenFromSessionValue(maybeSession.session)
    );
  }

  return null;
}

function getCookieToken(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const directCookieNames = ["sb-access-token", "supabase-access-token"];

  for (const name of directCookieNames) {
    const value = cookies.get(name);
    const token = extractTokenFromSessionValue(value);
    if (token) {
      return token;
    }
  }

  const chunkGroups = new Map<string, Array<{ index: number; value: string }>>();

  for (const [name, value] of cookies.entries()) {
    const match = name.match(/^(sb-[^.]+-auth-token)(?:\.(\d+))?$/);
    if (!match) {
      continue;
    }

    const baseName = match[1];
    const chunkIndex = match[2] ? Number(match[2]) : 0;
    const group = chunkGroups.get(baseName) ?? [];
    group.push({ index: chunkIndex, value });
    chunkGroups.set(baseName, group);
  }

  for (const parts of chunkGroups.values()) {
    const joined = parts
      .sort((left, right) => left.index - right.index)
      .map((part) => part.value)
      .join("");
    const token = extractTokenFromSessionValue(joined);
    if (token) {
      return token;
    }
  }

  return null;
}

function getAccessToken(request: Request): string | null {
  return getBearerToken(request) ?? getCookieToken(request);
}

function normalizeRole(profile: UserProfileRow | null): AppRole {
  if (profile?.role === "admin") {
    return "admin";
  }

  if (profile?.app_role === "admin" || profile?.app_role === "owner") {
    return "admin";
  }

  return "user";
}

export async function getCurrentUserWithRole(request: Request): Promise<CurrentUserWithRole | null> {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return null;
  }

  const supabase = getRequestSupabase(accessToken);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role, app_role, wallet_address")
    .eq("id", user.id)
    .maybeSingle<UserProfileRow>();

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(profileError.message);
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: normalizeRole(profile ?? null),
    walletAddress: profile?.wallet_address ?? null,
  };
}

export async function requireAdminUser(request: Request): Promise<RequireAdminResult> {
  const currentUser = await getCurrentUserWithRole(request);
  if (!currentUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  if (currentUser.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    user: currentUser,
  };
}
