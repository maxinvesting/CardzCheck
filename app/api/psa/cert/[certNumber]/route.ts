import { NextRequest, NextResponse } from "next/server";
import { getPSACert, normalizePSACert } from "@/lib/psa/client";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ certNumber: string }> }
) {
  // Auth check — must be signed in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certNumber } = await params;
  if (!certNumber?.trim()) {
    return NextResponse.json({ error: "cert number is required" }, { status: 400 });
  }

  try {
    const result = await getPSACert(certNumber);
    const normalized = normalizePSACert(result);
    return NextResponse.json({
      ok: true,
      card: normalized,
      raw: {
        CertNumber: result.cert.CertNumber,
        Year: result.cert.Year,
        Brand: result.cert.Brand,
        Subject: result.cert.Subject,
        CardNumber: result.cert.CardNumber,
        Variety: result.cert.Variety,
        CardGrade: result.cert.CardGrade,
        GradeDescription: result.cert.GradeDescription,
        LabelType: result.cert.LabelType,
        TotalPopulation: result.cert.TotalPopulation,
        PopulationHigher: result.cert.PopulationHigher,
        ItemStatus: result.cert.ItemStatus,
      },
      imageUrl: result.imageUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PSA lookup failed";
    const status = message.includes("not found") ? 404
      : message.includes("auth failed") ? 502
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
