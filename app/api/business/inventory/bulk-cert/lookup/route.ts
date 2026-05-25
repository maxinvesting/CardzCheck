import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupPsaCert, normalizeCertInput, PsaMappedResult } from "@/lib/psa/lookup";
import { getTierGates } from "@/lib/access";

const MAX_CERTS_PER_CALL = 100;
const CONCURRENCY = 5;
const CHUNK_DELAY_MS = 200;

type BulkCertLookupRow =
  | { cert: string; status: "found"; mapped: PsaMappedResult }
  | { cert: string; status: "not_found" }
  | { cert: string; status: "invalid"; reason: string }
  | { cert: string; status: "error"; reason: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const gates = await getTierGates(user.id);
  if (!gates.canBulkAddByCert) {
    return NextResponse.json(
      {
        error: "Bulk PSA cert import requires Business Pro.",
        upgradeRequired: true,
      },
      { status: 403 }
    );
  }

  let body: { certs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(body.certs)) {
    return NextResponse.json({ error: "certs array required" }, { status: 400 });
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of body.certs) {
    if (typeof raw !== "string") continue;
    const digits = normalizeCertInput(raw);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    normalized.push(digits);
  }

  if (normalized.length === 0) {
    return NextResponse.json({ error: "No valid cert numbers provided" }, { status: 400 });
  }
  if (normalized.length > MAX_CERTS_PER_CALL) {
    return NextResponse.json(
      { error: `Too many certs (max ${MAX_CERTS_PER_CALL} per call)` },
      { status: 400 }
    );
  }

  const results: BulkCertLookupRow[] = [];

  for (let i = 0; i < normalized.length; i += CONCURRENCY) {
    const chunk = normalized.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async (cert): Promise<BulkCertLookupRow> => {
        const outcome = await lookupPsaCert(cert);
        if (outcome.status === "found") return { cert, status: "found", mapped: outcome.mapped };
        if (outcome.status === "not_found") return { cert, status: "not_found" };
        if (outcome.status === "invalid") return { cert, status: "invalid", reason: outcome.reason };
        return { cert, status: "error", reason: outcome.reason };
      })
    );
    for (let j = 0; j < settled.length; j += 1) {
      const result = settled[j];
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          cert: chunk[j],
          status: "error",
          reason: result.reason instanceof Error ? result.reason.message : "Lookup failed",
        });
      }
    }
    if (i + CONCURRENCY < normalized.length) {
      await sleep(CHUNK_DELAY_MS);
    }
  }

  return NextResponse.json({ results });
}
