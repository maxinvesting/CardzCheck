"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type IntakeResp =
  | {
      approved: true;
      card_id: string;
      pipeline: "standard" | "elite" | "grails";
      requires_manual_approval: boolean;
      intake_approved: boolean;
      sold_comps_count: number;
    }
  | { approved: false; rejection_reason: string };

type Cmv = {
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  source: string;
  comps_count: number;
};

const fmt = (cents: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString()}`;

export default function SellNewClient() {
  const router = useRouter();

  // Card fields
  const [title, setTitle] = useState("");
  const [player, setPlayer] = useState("");
  const [year, setYear] = useState("");
  const [manufacturer, setManufacturer] = useState<"topps" | "panini">("topps");
  const [grade, setGrade] = useState("PSA 10");
  const [gradingService, setGradingService] = useState<"PSA" | "BGS" | "SGC">("PSA");
  const [certNumber, setCertNumber] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");

  // Listing fields
  const [mode, setMode] = useState<"self_serve" | "full_service">("self_serve");
  const [sellerPrice, setSellerPrice] = useState("");

  // Flow state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeResult, setIntakeResult] = useState<IntakeResp | null>(null);
  const [cmv, setCmv] = useState<Cmv | null>(null);
  const [feeEstimate, setFeeEstimate] = useState<{
    fee_tier: string;
    fee_amount_cents: number | null;
    take_home_cents: number | null;
  } | null>(null);

  async function submitIntake(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setIntakeResult(null);
    setCmv(null);
    setFeeEstimate(null);

    try {
      const res = await fetch("/api/marketplace/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          player,
          year: Number(year),
          manufacturer,
          grade,
          grading_service: gradingService,
          cert_number: certNumber || null,
          estimated_value_cents: Math.round(Number(estimatedValue) * 100),
        }),
      });
      const body = (await res.json()) as Partial<
        Extract<IntakeResp, { approved: true }>
      > &
        Partial<Extract<IntakeResp, { approved: false }>> & {
          error?: string;
        };
      if (!res.ok && body.approved === undefined) {
        throw new Error(body.error ?? "intake_failed");
      }
      setIntakeResult(body as IntakeResp);

      if (body.approved && body.intake_approved && body.card_id) {
        const cmvRes = await fetch(
          `/api/marketplace/cmv?card_id=${body.card_id}`
        );
        if (cmvRes.ok) {
          setCmv((await cmvRes.json()) as Cmv);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setBusy(false);
    }
  }

  async function createListing() {
    if (!intakeResult || !("card_id" in intakeResult)) return;
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        card_id: intakeResult.card_id,
        mode,
      };
      if (mode === "self_serve") {
        payload.list_price_cents = Math.round(Number(sellerPrice) * 100);
      }
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "listing_failed");

      const feeRes = await fetch(
        `/api/marketplace/listings/${body.listing.id}/fee-estimate`
      );
      if (feeRes.ok) setFeeEstimate(await feeRes.json());

      router.push("/marketplace/sell/listings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setBusy(false);
    }
  }

  const intakeApprovedCard =
    intakeResult && "approved" in intakeResult && intakeResult.approved
      ? intakeResult
      : null;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!intakeResult && (
        <form onSubmit={submitIntake} className="space-y-4">
          <h2 className="text-lg font-semibold">Card details</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title" value={title} onChange={setTitle} required />
            <Field label="Player" value={player} onChange={setPlayer} required />
            <Field label="Year" value={year} onChange={setYear} type="number" required />
            <Select
              label="Manufacturer"
              value={manufacturer}
              onChange={(v) => setManufacturer(v as "topps" | "panini")}
              options={[
                { value: "topps", label: "Topps" },
                { value: "panini", label: "Panini" },
              ]}
            />
            <Select
              label="Grading service"
              value={gradingService}
              onChange={(v) => setGradingService(v as "PSA" | "BGS" | "SGC")}
              options={[
                { value: "PSA", label: "PSA" },
                { value: "BGS", label: "BGS" },
                { value: "SGC", label: "SGC" },
              ]}
            />
            <Field label="Grade" value={grade} onChange={setGrade} required />
            <Field label="Cert number" value={certNumber} onChange={setCertNumber} />
            <Field
              label="Estimated value (USD)"
              value={estimatedValue}
              onChange={setEstimatedValue}
              type="number"
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit for intake"}
          </button>
        </form>
      )}

      {intakeResult && "approved" in intakeResult && !intakeResult.approved && (
        <div className="rounded border border-amber-700 bg-amber-950/30 p-4 text-sm">
          <div className="font-semibold">Card rejected at intake</div>
          <div className="text-amber-300 mt-1">
            Reason: <code>{intakeResult.rejection_reason}</code>
          </div>
          <button
            onClick={() => setIntakeResult(null)}
            className="mt-3 text-cyan-400 hover:underline text-xs"
          >
            ← Edit and resubmit
          </button>
        </div>
      )}

      {intakeApprovedCard && !intakeApprovedCard.intake_approved && (
        <div className="rounded border border-purple-700 bg-purple-950/30 p-4 text-sm">
          <div className="font-semibold">Pending admin approval</div>
          <div className="text-purple-300 mt-1">
            Pipeline: {intakeApprovedCard.pipeline}. An admin will review this
            card before listing is enabled. You'll see it under your listings
            once approved.
          </div>
        </div>
      )}

      {intakeApprovedCard?.intake_approved && (
        <div className="space-y-4">
          <div className="rounded border border-emerald-700 bg-emerald-950/20 p-4 text-sm">
            <div className="font-semibold">
              Approved — pipeline: {intakeApprovedCard.pipeline}
            </div>
            <div className="text-emerald-300 mt-1">
              {intakeApprovedCard.sold_comps_count} sold comps found.
            </div>
          </div>

          {cmv && (
            <div className="rounded border border-gray-800 bg-gray-900 p-4">
              <div className="text-xs uppercase text-gray-400">CMV reference</div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div>
                  <div className="text-gray-500">Low</div>
                  <div>{fmt(cmv.low_cents)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Mid</div>
                  <div className="font-semibold">{fmt(cmv.mid_cents)}</div>
                </div>
                <div>
                  <div className="text-gray-500">High</div>
                  <div>{fmt(cmv.high_cents)}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Source: {cmv.source} · {cmv.comps_count} comps
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Listing mode</h3>
            <div className="flex gap-2">
              {(["self_serve", "full_service"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 rounded text-sm border ${
                    mode === m
                      ? "border-cyan-500 text-cyan-400 bg-cyan-950/30"
                      : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {m === "self_serve" ? "Self-serve" : "Full-service"}
                </button>
              ))}
            </div>

            {mode === "full_service" ? (
              <div className="rounded border border-gray-800 bg-gray-950 p-3 text-sm">
                <div className="text-gray-400 text-xs uppercase">
                  Set by CMV (locked)
                </div>
                <div className="text-xl font-semibold mt-1">
                  {fmt(cmv?.mid_cents ?? null)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Full-service listings price at CMV mid. Lifecycle reduces 7.5% at day 30.
                </div>
              </div>
            ) : (
              <div>
                <Field
                  label="Your asking price (USD)"
                  value={sellerPrice}
                  onChange={setSellerPrice}
                  type="number"
                  required
                />
                <div className="text-xs text-gray-500 mt-1">
                  Self-serve fee tier: 1%. CMV shown above is reference only.
                </div>
              </div>
            )}

            {feeEstimate && (
              <div className="rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-400">
                Fee tier: <span className="text-white">{feeEstimate.fee_tier}</span> ·
                fee {fmt(feeEstimate.fee_amount_cents)} · take-home{" "}
                {fmt(feeEstimate.take_home_cents)}
              </div>
            )}

            <button
              onClick={createListing}
              disabled={
                busy || (mode === "self_serve" && !sellerPrice) ||
                (mode === "full_service" && cmv?.mid_cents == null)
              }
              className="px-4 py-2 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create listing"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
