import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface PsaCertObject {
  Subject?: string;
  Year?: string;
  Brand?: string;
  CardNumber?: string;
  GradeName?: string;
  CardGrade?: string;
  SpecLevel?: string;
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

function mapPsaResponse(data: PsaApiResponse): PsaMappedResult {
  const cert = data?.PSACert ?? {};

  let grade: string | null = null;
  if (cert.GradeName && cert.GradeName.trim()) {
    grade = cert.GradeName.trim();
    if (!/^PSA\s/i.test(grade)) {
      grade = `PSA ${grade}`;
    }
  } else if (cert.CardGrade && cert.CardGrade.trim()) {
    grade = `PSA ${cert.CardGrade.trim()}`;
  }

  return {
    player_name: cert.Subject?.trim() || null,
    year: cert.Year?.trim() || null,
    set_name: cert.Brand?.trim() || null,
    card_number: cert.CardNumber?.trim() || null,
    grade,
    grading_company: "PSA",
    parallel_type: cert.SpecLevel?.trim() || null,
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

  const certNumber = rawCert.trim().replace(/\s+/g, "");
  if (certNumber.length < 5) {
    return NextResponse.json({ error: "certNumber is too short" }, { status: 400 });
  }

  const token = process.env.PSA_ACCESS_TOKEN;
  if (!token) {
    console.error("[psa/lookup] PSA_ACCESS_TOKEN not configured");
    return NextResponse.json({ error: "PSA lookup failed", found: false }, { status: 503 });
  }

  let psaData: PsaApiResponse;
  try {
    const res = await fetch(
      `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`,
      {
        headers: { Authorization: `Bearer ${token}` },
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

  if (!psaData?.PSACert) {
    return NextResponse.json({ error: "Cert not found", found: false });
  }

  return NextResponse.json({ found: true, ...mapPsaResponse(psaData) });
}
