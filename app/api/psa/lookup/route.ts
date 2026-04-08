import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface PsaCertObject {
  CertNumber?: string;
  Subject?: string;
  Year?: string;
  Brand?: string;
  CardNumber?: string;
  GradeName?: string;
  CardGrade?: string;
  SpecLevel?: string;
  /** PSA often uses Variety for parallels / variations */
  Variety?: string;
  [key: string]: unknown;
}

interface PsaApiResponse {
  PSACert?: PsaCertObject;
  [key: string]: unknown;
}

interface PsaMappedResult {
  player_name: string | null;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  grading_company: "PSA";
  parallel_type: string | null;
}

function normalizePsaGradeLabel(cert: PsaCertObject): string | null {
  const cardGrade = cert.CardGrade?.trim();
  if (cardGrade) {
    return /^PSA\s/i.test(cardGrade) ? cardGrade : `PSA ${cardGrade}`;
  }
  const gradeName = cert.GradeName?.trim();
  if (!gradeName) return null;
  if (/^PSA\s/i.test(gradeName)) return gradeName;
  const numeric = gradeName.match(/(\d+(?:\.\d+)?)/);
  if (numeric) return `PSA ${numeric[1]}`;
  return `PSA ${gradeName}`;
}

function mapPsaCert(cert: PsaCertObject): PsaMappedResult {
  const grade = normalizePsaGradeLabel(cert);

  return {
    player_name: cert.Subject?.trim() || null,
    year: cert.Year?.trim() || null,
    set_name: cert.Brand?.trim() || null,
    card_number: cert.CardNumber?.trim() || null,
    grade,
    grading_company: "PSA",
    parallel_type: cert.SpecLevel?.trim() || cert.Variety?.trim() || null,
  };
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

  const token = (process.env.PSA_ACCESS_TOKEN ?? process.env.PSA_API_TOKEN)?.trim();
  if (!token) {
    console.error("[psa/lookup] PSA_ACCESS_TOKEN (or PSA_API_TOKEN) not configured");
    return NextResponse.json({ error: "PSA lookup failed", found: false }, { status: 503 });
  }

  let psaData: PsaApiResponse;
  try {
    const res = await fetch(
      `https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(certDigits)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "X-Api-Key": token,
        },
        cache: "no-store",
      }
    );

    if (res.status === 404) {
      return NextResponse.json({ error: "Cert not found", found: false });
    }

    if (!res.ok) {
      console.error("[psa/lookup] PSA API error", res.status);
      return NextResponse.json({ error: "PSA lookup failed", found: false });
    }

    psaData = await res.json();
  } catch (err) {
    console.error("[psa/lookup] PSA fetch failed", err);
    return NextResponse.json({ error: "PSA lookup failed", found: false });
  }

  const certPayload = psaData?.PSACert ?? (psaData as unknown as PsaCertObject | undefined);
  const cert =
    certPayload && typeof certPayload === "object" && !Array.isArray(certPayload)
      ? (certPayload as PsaCertObject)
      : null;
  const certNo = cert?.CertNumber?.trim();
  if (!cert || (!certNo && !cert.Subject?.trim())) {
    return NextResponse.json({ error: "Cert not found", found: false });
  }

  return NextResponse.json({ found: true, ...mapPsaCert(cert) });
}
