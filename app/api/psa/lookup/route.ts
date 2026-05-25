import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  findPsaCertObject,
  getPsaServerMessage,
  isPsaInvalidRequestPayload,
  isPsaNotFoundPayload,
  mapPsaCert,
  parsePsaCertHtml,
  readPsaToken,
} from "@/lib/psa/lookup";

async function lookupPsaViaPublicCertPage(certDigits: string) {
  const urls = [
    `https://www.psacard.com/cert/${encodeURIComponent(certDigits)}/psa`,
    `https://www.psacard.com/cert/${encodeURIComponent(certDigits)}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0 (compatible; CardzCheck PSA Lookup)",
        },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;
      const html = await response.text();
      const parsed = parsePsaCertHtml(html, certDigits);
      if (parsed?.player_name || parsed?.set_name || parsed?.card_number) {
        return parsed;
      }
    } catch {
      // Best-effort fallback.
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { certNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawCert = body?.certNumber;
  if (!rawCert || typeof rawCert !== "string") {
    return NextResponse.json({ error: "certNumber is required" }, { status: 400 });
  }

  const certDigits = rawCert.trim().replace(/\D/g, "");
  if (certDigits.length < 5) {
    return NextResponse.json({ error: "certNumber is too short" }, { status: 400 });
  }

  const token = readPsaToken();
  if (!token) {
    const fallback = await lookupPsaViaPublicCertPage(certDigits);
    if (fallback) {
      return NextResponse.json({ found: true, ...fallback });
    }

    console.error("[psa/lookup] No PSA token in env (checked PSA_ACCESS_TOKEN / PSA_API_TOKEN, any casing)");
    return NextResponse.json(
      { error: "PSA lookup unavailable right now", found: false },
      { status: 503 }
    );
  }

  let psaData: unknown = null;
  try {
    const res = await fetch(
      `https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(certDigits)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.status === 404 || res.status === 204) {
      return NextResponse.json({ error: "Cert not found", found: false });
    }

    psaData = await res.json().catch(() => null);

    if (!res.ok) {
      const fallback = await lookupPsaViaPublicCertPage(certDigits);
      if (fallback) {
        return NextResponse.json({ found: true, ...fallback });
      }

      console.error("[psa/lookup] PSA API error", res.status, getPsaServerMessage(psaData));
      return NextResponse.json(
        { error: "PSA lookup unavailable right now", found: false },
        { status: res.status >= 500 ? 503 : 502 }
      );
    }
  } catch (err) {
    const fallback = await lookupPsaViaPublicCertPage(certDigits);
    if (fallback) {
      return NextResponse.json({ found: true, ...fallback });
    }

    console.error("[psa/lookup] PSA fetch failed", err);
    return NextResponse.json(
      { error: "PSA lookup unavailable right now", found: false },
      { status: 503 }
    );
  }

  if (isPsaInvalidRequestPayload(psaData) || isPsaNotFoundPayload(psaData)) {
    return NextResponse.json({ error: "Cert not found", found: false });
  }

  const cert = findPsaCertObject(psaData);
  if (!cert) {
    const fallback = await lookupPsaViaPublicCertPage(certDigits);
    if (fallback) {
      return NextResponse.json({ found: true, ...fallback });
    }

    console.error("[psa/lookup] PSA response missing cert payload", getPsaServerMessage(psaData));
    return NextResponse.json(
      { error: "PSA lookup unavailable right now", found: false },
      { status: 502 }
    );
  }

  const mapped = mapPsaCert(cert);
  if (!mapped.player_name && !mapped.set_name && !mapped.card_number) {
    return NextResponse.json({ error: "Cert not found", found: false });
  }

  return NextResponse.json({ found: true, ...mapped });
}
