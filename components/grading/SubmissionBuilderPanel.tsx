"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PricingModal from "@/components/PricingModal";
import type { CardIdentificationResult, GradeEstimate } from "@/types";

type SubmissionMode = "mock" | "actual";
type SubmissionStatus =
  | "draft"
  | "ready"
  | "shipped"
  | "arrived"
  | "grading"
  | "qa"
  | "shipped_back"
  | "received"
  | "completed";

type PsaDistribution = {
  "10": number;
  "9": number;
  "8": number;
  "7_or_lower": number;
};

type SubmissionListRow = {
  id: string;
  name: string;
  mode: SubmissionMode;
  grader: "psa";
  status: SubmissionStatus;
  psa_order_id: string | null;
  service_level: string | null;
  declared_value_cents: number;
  shipping_cents: number;
  insurance_cents: number;
  fees_estimate_cents: number;
  fees_actual_cents: number | null;
  item_count: number;
  card_count: number;
  created_at: string;
};

type SubmissionDetailItem = {
  id: string;
  source_type: "collection" | "watchlist" | "manual";
  source_id: string | null;
  title: string;
  quantity: number;
  cost_basis_cents: number | null;
  predicted_distribution: PsaDistribution;
  estimated_value_by_grade: {
    "10": number | null;
    "9": number | null;
    "8": number | null;
    "7_or_lower": number | null;
  };
  expected_value_cents: number;
  expected_profit_cents: number;
  break_even_grade: string | null;
  below_break_even_probability: number | null;
  risk_flags: string[];
  actual_grade: string | null;
  cert_number: string | null;
};

type SubmissionDetail = {
  submission: SubmissionListRow;
  items: SubmissionDetailItem[];
  summary: {
    total_cards: number;
    total_estimated_fees_cents: number;
    total_expected_value_cents: number;
    total_expected_profit_cents: number;
    downside_percent: number;
  };
  comparison_rows: Array<{
    item_id: string;
    title: string;
    predicted_most_likely_grade: string | null;
    predicted_probability: number | null;
    actual_grade: string | null;
  }>;
};

type CollectionCard = {
  id: string;
  player_name: string;
  year: string | null;
  set_name: string | null;
  card_number?: string | null;
  parallel_type?: string | null;
  insert?: string | null;
  purchase_price: number | null;
};

type WatchlistCard = {
  id: string;
  player_name: string;
  year: string | null;
  set_brand: string | null;
  card_number: string | null;
  parallel_variant: string | null;
};

type ManualDistributionInput = {
  ten: string;
  nine: string;
  eight: string;
  seven: string;
};

interface SubmissionBuilderPanelProps {
  identifiedCard: CardIdentificationResult | null;
  gradeEstimate: GradeEstimate | null;
}

const STATUS_OPTIONS: SubmissionStatus[] = [
  "draft",
  "ready",
  "shipped",
  "arrived",
  "grading",
  "qa",
  "shipped_back",
  "received",
  "completed",
];

const DEFAULT_MANUAL_DISTRIBUTION: ManualDistributionInput = {
  ten: "8",
  nine: "34",
  eight: "36",
  seven: "22",
};

function formatMoney(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function usdTextToCents(value: string): number {
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function centsToUsdInput(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return (value / 100).toFixed(2);
}

function normalizeDistributionFromEstimate(estimate: GradeEstimate | null): PsaDistribution | null {
  const psa = estimate?.grade_probabilities?.psa;
  if (!psa) return null;
  const total = psa["10"] + psa["9"] + psa["8"] + psa["7_or_lower"];
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    "10": psa["10"] / total,
    "9": psa["9"] / total,
    "8": psa["8"] / total,
    "7_or_lower": psa["7_or_lower"] / total,
  };
}

function buildIdentityTitle(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" | ");
}

function parsePercentInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export default function SubmissionBuilderPanel({
  identifiedCard,
  gradeEstimate,
}: SubmissionBuilderPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaidUser, setIsPaidUser] = useState(true);
  const [showPricing, setShowPricing] = useState(false);

  const [submissions, setSubmissions] = useState<SubmissionListRow[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("");
  const [selectedDetail, setSelectedDetail] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState<SubmissionMode>("mock");
  const [creating, setCreating] = useState(false);

  const [costShipping, setCostShipping] = useState("0");
  const [costInsurance, setCostInsurance] = useState("0");
  const [costFeesEstimate, setCostFeesEstimate] = useState("0");
  const [costFeesActual, setCostFeesActual] = useState("");
  const [declaredValue, setDeclaredValue] = useState("0");
  const [serviceLevel, setServiceLevel] = useState("");
  const [psaOrderId, setPsaOrderId] = useState("");
  const [statusDraft, setStatusDraft] = useState<SubmissionStatus>("draft");
  const [savingSubmission, setSavingSubmission] = useState(false);

  const [collectionCards, setCollectionCards] = useState<CollectionCard[]>([]);
  const [watchlistCards, setWatchlistCards] = useState<WatchlistCard[]>([]);
  const [collectionSelection, setCollectionSelection] = useState<string[]>([]);
  const [watchlistSelection, setWatchlistSelection] = useState<string[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const [manualPlayer, setManualPlayer] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualSet, setManualSet] = useState("");
  const [manualCardNumber, setManualCardNumber] = useState("");
  const [manualParallel, setManualParallel] = useState("");
  const [manualCostBasis, setManualCostBasis] = useState("");
  const [manualDistribution, setManualDistribution] =
    useState<ManualDistributionInput>(DEFAULT_MANUAL_DISTRIBUTION);

  const [addingItems, setAddingItems] = useState(false);

  const [minPsa10Pct, setMinPsa10Pct] = useState("0");
  const [minExpectedProfit, setMinExpectedProfit] = useState("0");

  const [actualDrafts, setActualDrafts] = useState<Record<string, { actual_grade: string; cert_number: string }>>({});
  const [savingActuals, setSavingActuals] = useState(false);

  const currentEstimateDistribution = useMemo(
    () => normalizeDistributionFromEstimate(gradeEstimate),
    [gradeEstimate]
  );

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/grading-submissions", { cache: "no-store" });
      if (response.status === 403) {
        setIsPaidUser(false);
        setSubmissions([]);
        setSelectedSubmissionId("");
        setSelectedDetail(null);
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to load submissions");
      }

      setIsPaidUser(true);
      const payload = await response.json();
      const nextSubmissions = (payload?.submissions ?? []) as SubmissionListRow[];
      setSubmissions(nextSubmissions);

      setSelectedSubmissionId((prev) => {
        if (prev && nextSubmissions.some((submission) => submission.id === prev)) {
          return prev;
        }
        return nextSubmissions[0]?.id ?? "";
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubmissionDetail = useCallback(async (submissionId: string) => {
    if (!submissionId) {
      setSelectedDetail(null);
      return;
    }

    setDetailLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/grading-submissions/${submissionId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to load submission");
      }

      const payload = (await response.json()) as SubmissionDetail;
      setSelectedDetail(payload);
      setCostShipping(centsToUsdInput(payload.submission.shipping_cents));
      setCostInsurance(centsToUsdInput(payload.submission.insurance_cents));
      setCostFeesEstimate(centsToUsdInput(payload.submission.fees_estimate_cents));
      setCostFeesActual(centsToUsdInput(payload.submission.fees_actual_cents));
      setDeclaredValue(centsToUsdInput(payload.submission.declared_value_cents));
      setServiceLevel(payload.submission.service_level ?? "");
      setPsaOrderId(payload.submission.psa_order_id ?? "");
      setStatusDraft(payload.submission.status);

      const drafts: Record<string, { actual_grade: string; cert_number: string }> = {};
      payload.items.forEach((item) => {
        drafts[item.id] = {
          actual_grade: item.actual_grade ?? "",
          cert_number: item.cert_number ?? "",
        };
      });
      setActualDrafts(drafts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load submission detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const [collectionRes, watchlistRes] = await Promise.all([
        fetch("/api/collection", { cache: "no-store" }),
        fetch("/api/watchlist", { cache: "no-store" }),
      ]);

      const collectionPayload = await collectionRes.json().catch(() => ({ items: [] }));
      const watchlistPayload = await watchlistRes.json().catch(() => ({ items: [] }));

      setCollectionCards((collectionPayload?.items ?? []) as CollectionCard[]);
      setWatchlistCards((watchlistPayload?.items ?? []) as WatchlistCard[]);
    } catch (sourceError) {
      console.error("Failed to load sources for submission builder:", sourceError);
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    void loadSubmissionDetail(selectedSubmissionId);
  }, [selectedSubmissionId, loadSubmissionDetail]);

  useEffect(() => {
    if (!isPaidUser) return;
    void loadSources();
  }, [isPaidUser, loadSources]);

  const filteredItems = useMemo(() => {
    if (!selectedDetail) return [];

    const minP10 = Number(minPsa10Pct);
    const minProfit = Number(minExpectedProfit);

    return selectedDetail.items.filter((item) => {
      const psa10Pct = (item.predicted_distribution?.["10"] ?? 0) * 100;
      const expectedProfit = item.expected_profit_cents / 100;
      return psa10Pct >= (Number.isFinite(minP10) ? minP10 : 0) &&
        expectedProfit >= (Number.isFinite(minProfit) ? minProfit : 0);
    });
  }, [selectedDetail, minPsa10Pct, minExpectedProfit]);

  const createSubmission = useCallback(async () => {
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/grading-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), mode: createMode, grader: "psa" }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to create submission");
      }

      const payload = await response.json();
      const created = payload?.submission as SubmissionListRow | undefined;

      setCreateName("");
      await loadSubmissions();
      if (created?.id) {
        setSelectedSubmissionId(created.id);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create submission");
    } finally {
      setCreating(false);
    }
  }, [createName, createMode, loadSubmissions]);

  const saveSubmissionFields = useCallback(async () => {
    if (!selectedSubmissionId) return;

    setSavingSubmission(true);
    setError(null);

    try {
      const response = await fetch(`/api/grading-submissions/${selectedSubmissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_cents: usdTextToCents(costShipping),
          insurance_cents: usdTextToCents(costInsurance),
          fees_estimate_cents: usdTextToCents(costFeesEstimate),
          fees_actual_cents: costFeesActual.trim() ? usdTextToCents(costFeesActual) : null,
          declared_value_cents: usdTextToCents(declaredValue),
          service_level: serviceLevel.trim() || null,
          psa_order_id: psaOrderId.trim() || null,
          status: statusDraft,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to save submission");
      }

      await loadSubmissions();
      await loadSubmissionDetail(selectedSubmissionId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save submission");
    } finally {
      setSavingSubmission(false);
    }
  }, [
    selectedSubmissionId,
    costShipping,
    costInsurance,
    costFeesEstimate,
    costFeesActual,
    declaredValue,
    serviceLevel,
    psaOrderId,
    statusDraft,
    loadSubmissions,
    loadSubmissionDetail,
  ]);

  const addItems = useCallback(
    async (
      items: Array<{
        source_type: "collection" | "watchlist" | "manual";
        source_id?: string | null;
        title: string;
        quantity?: number;
        cost_basis_cents?: number | null;
        predicted_distribution?: Partial<PsaDistribution>;
        card?: {
          player_name: string;
          year?: string | null;
          set_name?: string | null;
          card_number?: string | null;
          parallel_type?: string | null;
          variation?: string | null;
          insert?: string | null;
        };
      }>
    ) => {
      if (!selectedSubmissionId || items.length === 0) return;
      setAddingItems(true);
      setError(null);
      try {
        const response = await fetch(`/api/grading-submissions/${selectedSubmissionId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Failed to add items");
        }

        await loadSubmissions();
        await loadSubmissionDetail(selectedSubmissionId);
      } catch (itemError) {
        setError(itemError instanceof Error ? itemError.message : "Failed to add items");
      } finally {
        setAddingItems(false);
      }
    },
    [selectedSubmissionId, loadSubmissions, loadSubmissionDetail]
  );

  const addCurrentCard = useCallback(async () => {
    if (!identifiedCard) return;

    const title = buildIdentityTitle([
      identifiedCard.player_name,
      identifiedCard.year,
      identifiedCard.set_name,
      identifiedCard.parallel_type,
      identifiedCard.card_number ? `#${identifiedCard.card_number}` : null,
    ]);

    await addItems([
      {
        source_type: "manual",
        title: title || identifiedCard.player_name,
        quantity: 1,
        cost_basis_cents: null,
        predicted_distribution: currentEstimateDistribution ?? undefined,
        card: {
          player_name: identifiedCard.player_name,
          year: identifiedCard.year ?? null,
          set_name: identifiedCard.set_name ?? null,
          card_number: identifiedCard.card_number ?? null,
          parallel_type: identifiedCard.parallel_type ?? null,
          variation: identifiedCard.variation ?? null,
          insert: identifiedCard.insert ?? null,
        },
      },
    ]);
  }, [identifiedCard, addItems, currentEstimateDistribution]);

  const addSelectedCollection = useCallback(async () => {
    const selected = collectionCards.filter((card) => collectionSelection.includes(card.id));
    if (selected.length === 0) return;

    await addItems(
      selected.map((card) => ({
        source_type: "collection" as const,
        source_id: card.id,
        title:
          buildIdentityTitle([
            card.player_name,
            card.year,
            card.set_name,
            card.parallel_type,
            card.card_number ? `#${card.card_number}` : null,
          ]) || card.player_name,
        quantity: 1,
        cost_basis_cents:
          typeof card.purchase_price === "number" && Number.isFinite(card.purchase_price)
            ? Math.round(card.purchase_price * 100)
            : null,
        predicted_distribution: currentEstimateDistribution ?? undefined,
        card: {
          player_name: card.player_name,
          year: card.year,
          set_name: card.set_name,
          card_number: card.card_number ?? null,
          parallel_type: card.parallel_type ?? null,
          variation: null,
          insert: card.insert ?? null,
        },
      }))
    );

    setCollectionSelection([]);
  }, [collectionCards, collectionSelection, addItems, currentEstimateDistribution]);

  const addSelectedWatchlist = useCallback(async () => {
    const selected = watchlistCards.filter((card) => watchlistSelection.includes(card.id));
    if (selected.length === 0) return;

    await addItems(
      selected.map((card) => ({
        source_type: "watchlist" as const,
        source_id: card.id,
        title:
          buildIdentityTitle([
            card.player_name,
            card.year,
            card.set_brand,
            card.parallel_variant,
            card.card_number ? `#${card.card_number}` : null,
          ]) || card.player_name,
        quantity: 1,
        cost_basis_cents: null,
        predicted_distribution: currentEstimateDistribution ?? undefined,
        card: {
          player_name: card.player_name,
          year: card.year,
          set_name: card.set_brand,
          card_number: card.card_number,
          parallel_type: card.parallel_variant,
          variation: null,
          insert: null,
        },
      }))
    );

    setWatchlistSelection([]);
  }, [watchlistCards, watchlistSelection, addItems, currentEstimateDistribution]);

  const addManualEntry = useCallback(async () => {
    if (!manualPlayer.trim()) {
      setError("Manual entry requires player name");
      return;
    }

    const manualDistributionDecimal: Partial<PsaDistribution> = {
      "10": parsePercentInput(manualDistribution.ten) / 100,
      "9": parsePercentInput(manualDistribution.nine) / 100,
      "8": parsePercentInput(manualDistribution.eight) / 100,
      "7_or_lower": parsePercentInput(manualDistribution.seven) / 100,
    };

    await addItems([
      {
        source_type: "manual",
        title:
          buildIdentityTitle([
            manualPlayer,
            manualYear,
            manualSet,
            manualParallel,
            manualCardNumber ? `#${manualCardNumber}` : null,
          ]) || manualPlayer,
        quantity: 1,
        cost_basis_cents: manualCostBasis.trim() ? usdTextToCents(manualCostBasis) : null,
        predicted_distribution: manualDistributionDecimal,
        card: {
          player_name: manualPlayer.trim(),
          year: manualYear.trim() || null,
          set_name: manualSet.trim() || null,
          card_number: manualCardNumber.trim() || null,
          parallel_type: manualParallel.trim() || null,
          variation: null,
          insert: null,
        },
      },
    ]);

    setManualPlayer("");
    setManualYear("");
    setManualSet("");
    setManualCardNumber("");
    setManualParallel("");
    setManualCostBasis("");
    setManualDistribution(DEFAULT_MANUAL_DISTRIBUTION);
  }, [
    manualPlayer,
    manualYear,
    manualSet,
    manualParallel,
    manualCardNumber,
    manualCostBasis,
    manualDistribution,
    addItems,
  ]);

  const saveReturnedGrades = useCallback(async () => {
    if (!selectedSubmissionId || !selectedDetail || selectedDetail.submission.mode !== "actual") return;

    const updates = Object.entries(actualDrafts)
      .filter(([, value]) => value.actual_grade.trim().length > 0)
      .map(([id, value]) => ({
        id,
        actual_grade: value.actual_grade.trim(),
        cert_number: value.cert_number.trim() || null,
      }));

    if (updates.length === 0) {
      setError("Enter at least one actual grade before saving");
      return;
    }

    setSavingActuals(true);
    setError(null);

    try {
      const response = await fetch(`/api/grading-submissions/${selectedSubmissionId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updates }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to save returned grades");
      }

      await loadSubmissionDetail(selectedSubmissionId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save returned grades");
    } finally {
      setSavingActuals(false);
    }
  }, [selectedSubmissionId, selectedDetail, actualDrafts, loadSubmissionDetail]);

  if (!isPaidUser) {
    return (
      <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-5">
        <h3 className="text-lg font-semibold text-amber-200">Build Submission</h3>
        <p className="mt-2 text-sm text-amber-100/90">
          Submission Builder and actual submission tracking are available on paid plans.
        </p>
        <button
          onClick={() => setShowPricing(true)}
          className="mt-4 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400"
        >
          Upgrade to Pro
        </button>
        <PricingModal isOpen={showPricing} onClose={() => setShowPricing(false)} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Build Submission</h3>
          <p className="text-sm text-gray-400">
            Create mock submissions for planning or actual submissions for PSA tracking.
          </p>
        </div>
        <button
          onClick={() => void loadSubmissions()}
          className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded border border-red-700/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-700 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Submission name (e.g. March PSA 20-card)"
            className="md:col-span-2 rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
          />
          <select
            value={createMode}
            onChange={(event) => setCreateMode(event.target.value as SubmissionMode)}
            className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
          >
            <option value="mock">Mock</option>
            <option value="actual">Actual</option>
          </select>
          <button
            disabled={creating || !createName.trim()}
            onClick={() => void createSubmission()}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Submission"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="text-sm text-gray-400">No submissions yet. Create one to begin.</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            {submissions.map((submission) => (
              <button
                key={submission.id}
                onClick={() => setSelectedSubmissionId(submission.id)}
                className={`rounded-lg border px-3 py-3 text-left ${
                  selectedSubmissionId === submission.id
                    ? "border-blue-500 bg-blue-900/30"
                    : "border-gray-700 bg-gray-900/40 hover:bg-gray-900/70"
                }`}
              >
                <p className="text-sm font-semibold text-white">{submission.name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {submission.mode.toUpperCase()} · {submission.status} · {submission.card_count} cards
                </p>
              </button>
            ))}
          </div>

          {detailLoading || !selectedDetail ? (
            <div className="text-sm text-gray-400">Loading submission details...</div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-700 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-xs text-gray-400">
                    <span>Declared value (USD)</span>
                    <input
                      value={declaredValue}
                      onChange={(event) => setDeclaredValue(event.target.value)}
                      className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-400">
                    <span>Shipping (USD)</span>
                    <input
                      value={costShipping}
                      onChange={(event) => setCostShipping(event.target.value)}
                      className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-400">
                    <span>Insurance (USD)</span>
                    <input
                      value={costInsurance}
                      onChange={(event) => setCostInsurance(event.target.value)}
                      className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-400">
                    <span>Estimated fees (USD)</span>
                    <input
                      value={costFeesEstimate}
                      onChange={(event) => setCostFeesEstimate(event.target.value)}
                      className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-400">
                    <span>Actual fees (USD, optional)</span>
                    <input
                      value={costFeesActual}
                      onChange={(event) => setCostFeesActual(event.target.value)}
                      className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-400">
                    <span>Status</span>
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value as SubmissionStatus)}
                      className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedDetail.submission.mode === "actual" ? (
                    <>
                      <label className="space-y-1 text-xs text-gray-400">
                        <span>PSA order id</span>
                        <input
                          value={psaOrderId}
                          onChange={(event) => setPsaOrderId(event.target.value)}
                          className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-gray-400">
                        <span>Service level</span>
                        <input
                          value={serviceLevel}
                          onChange={(event) => setServiceLevel(event.target.value)}
                          className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
                <button
                  onClick={() => void saveSubmissionFields()}
                  disabled={savingSubmission}
                  className="mt-3 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingSubmission ? "Saving..." : "Save Submission Settings"}
                </button>
              </div>

              <div className="rounded-lg border border-gray-700 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-white">Add Cards</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={addingItems || !identifiedCard}
                    onClick={() => void addCurrentCard()}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Add Current Analyzed Card
                  </button>
                  <button
                    disabled={addingItems || collectionSelection.length === 0}
                    onClick={() => void addSelectedCollection()}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Add Selected Collection Cards
                  </button>
                  <button
                    disabled={addingItems || watchlistSelection.length === 0}
                    onClick={() => void addSelectedWatchlist()}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Add Selected Watchlist Cards
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-gray-400 space-y-1">
                    <span>Collection picker</span>
                    <select
                      multiple
                      value={collectionSelection}
                      onChange={(event) => {
                        const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                        setCollectionSelection(values);
                      }}
                      className="h-40 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                    >
                      {collectionCards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {buildIdentityTitle([
                            card.player_name,
                            card.year,
                            card.set_name,
                            card.parallel_type,
                            card.card_number ? `#${card.card_number}` : null,
                          ])}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs text-gray-400 space-y-1">
                    <span>Watchlist picker</span>
                    <select
                      multiple
                      value={watchlistSelection}
                      onChange={(event) => {
                        const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                        setWatchlistSelection(values);
                      }}
                      className="h-40 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                    >
                      {watchlistCards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {buildIdentityTitle([
                            card.player_name,
                            card.year,
                            card.set_brand,
                            card.parallel_variant,
                            card.card_number ? `#${card.card_number}` : null,
                          ])}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {loadingSources ? (
                  <p className="text-xs text-gray-500">Loading collection/watchlist options...</p>
                ) : null}

                <div className="rounded border border-gray-700 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Manual entry</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      value={manualPlayer}
                      onChange={(event) => setManualPlayer(event.target.value)}
                      placeholder="Player (required)"
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={manualYear}
                      onChange={(event) => setManualYear(event.target.value)}
                      placeholder="Year"
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={manualSet}
                      onChange={(event) => setManualSet(event.target.value)}
                      placeholder="Set"
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={manualCardNumber}
                      onChange={(event) => setManualCardNumber(event.target.value)}
                      placeholder="Card #"
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={manualParallel}
                      onChange={(event) => setManualParallel(event.target.value)}
                      placeholder="Parallel"
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={manualCostBasis}
                      onChange={(event) => setManualCostBasis(event.target.value)}
                      placeholder="Cost basis USD"
                      className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="grid gap-2 md:grid-cols-4">
                    <label className="text-[11px] text-gray-400">
                      PSA10%
                      <input
                        value={manualDistribution.ten}
                        onChange={(event) =>
                          setManualDistribution((prev) => ({ ...prev, ten: event.target.value }))
                        }
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                      />
                    </label>
                    <label className="text-[11px] text-gray-400">
                      PSA9%
                      <input
                        value={manualDistribution.nine}
                        onChange={(event) =>
                          setManualDistribution((prev) => ({ ...prev, nine: event.target.value }))
                        }
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                      />
                    </label>
                    <label className="text-[11px] text-gray-400">
                      PSA8%
                      <input
                        value={manualDistribution.eight}
                        onChange={(event) =>
                          setManualDistribution((prev) => ({ ...prev, eight: event.target.value }))
                        }
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                      />
                    </label>
                    <label className="text-[11px] text-gray-400">
                      PSA7-%
                      <input
                        value={manualDistribution.seven}
                        onChange={(event) =>
                          setManualDistribution((prev) => ({ ...prev, seven: event.target.value }))
                        }
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                      />
                    </label>
                  </div>

                  <button
                    disabled={addingItems}
                    onClick={() => void addManualEntry()}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Add Manual Card
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 p-4">
                <h4 className="text-sm font-semibold text-white">Submission Summary</h4>
                <div className="mt-2 grid gap-2 md:grid-cols-5 text-xs">
                  <div className="rounded bg-gray-900/50 p-2">
                    <p className="text-gray-400">Total cards</p>
                    <p className="text-white font-semibold">{selectedDetail.summary.total_cards}</p>
                  </div>
                  <div className="rounded bg-gray-900/50 p-2">
                    <p className="text-gray-400">Estimated fees</p>
                    <p className="text-white font-semibold">
                      {formatMoney(selectedDetail.summary.total_estimated_fees_cents)}
                    </p>
                  </div>
                  <div className="rounded bg-gray-900/50 p-2">
                    <p className="text-gray-400">Expected value</p>
                    <p className="text-white font-semibold">
                      {formatMoney(selectedDetail.summary.total_expected_value_cents)}
                    </p>
                  </div>
                  <div className="rounded bg-gray-900/50 p-2">
                    <p className="text-gray-400">Expected profit</p>
                    <p className="text-white font-semibold">
                      {formatMoney(selectedDetail.summary.total_expected_profit_cents)}
                    </p>
                  </div>
                  <div className="rounded bg-gray-900/50 p-2">
                    <p className="text-gray-400">Likely negative</p>
                    <p className="text-white font-semibold">
                      {selectedDetail.summary.downside_percent.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">Filters</h4>
                  <label className="text-xs text-gray-400">
                    Min P(PSA10)%
                    <input
                      value={minPsa10Pct}
                      onChange={(event) => setMinPsa10Pct(event.target.value)}
                      className="ml-2 w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <label className="text-xs text-gray-400">
                    Min expected profit (USD)
                    <input
                      value={minExpectedProfit}
                      onChange={(event) => setMinExpectedProfit(event.target.value)}
                      className="ml-2 w-20 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <span className="text-xs text-gray-500">
                    Showing {filteredItems.length}/{selectedDetail.items.length} items
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="py-2 text-left">Card</th>
                        <th className="py-2 text-left">Source</th>
                        <th className="py-2 text-left">P10</th>
                        <th className="py-2 text-left">Distribution</th>
                        <th className="py-2 text-left">Expected value</th>
                        <th className="py-2 text-left">Expected profit</th>
                        <th className="py-2 text-left">Below break-even</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="border-b border-gray-800 align-top">
                          <td className="py-2 pr-2 text-white">
                            {item.title}
                            {item.risk_flags.includes("value_unavailable") ? (
                              <p className="text-[11px] text-amber-300">value unavailable</p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 text-gray-300">{item.source_type}</td>
                          <td className="py-2 pr-2 text-gray-300">
                            {((item.predicted_distribution?.["10"] ?? 0) * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 pr-2 text-gray-300">
                            {`${(item.predicted_distribution["10"] * 100).toFixed(0)}/${
                              (item.predicted_distribution["9"] * 100).toFixed(0)
                            }/${(item.predicted_distribution["8"] * 100).toFixed(0)}/${
                              (item.predicted_distribution["7_or_lower"] * 100).toFixed(0)
                            }`}
                          </td>
                          <td className="py-2 pr-2 text-gray-300">{formatMoney(item.expected_value_cents)}</td>
                          <td className="py-2 pr-2 text-gray-300">{formatMoney(item.expected_profit_cents)}</td>
                          <td className="py-2 pr-2 text-gray-300">
                            {formatPercent(item.below_break_even_probability)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedDetail.submission.mode === "actual" ? (
                <div className="rounded-lg border border-gray-700 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-white">Returned Grades (Bulk Entry)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400">
                          <th className="py-2 text-left">Card</th>
                          <th className="py-2 text-left">Actual grade</th>
                          <th className="py-2 text-left">Cert #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetail.items.map((item) => (
                          <tr key={item.id} className="border-b border-gray-800">
                            <td className="py-2 pr-2 text-white">{item.title}</td>
                            <td className="py-2 pr-2">
                              <input
                                value={actualDrafts[item.id]?.actual_grade ?? ""}
                                onChange={(event) =>
                                  setActualDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      actual_grade: event.target.value,
                                      cert_number: prev[item.id]?.cert_number ?? "",
                                    },
                                  }))
                                }
                                placeholder="PSA 10"
                                className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                value={actualDrafts[item.id]?.cert_number ?? ""}
                                onChange={(event) =>
                                  setActualDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      actual_grade: prev[item.id]?.actual_grade ?? "",
                                      cert_number: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Cert number"
                                className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    disabled={savingActuals}
                    onClick={() => void saveReturnedGrades()}
                    className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {savingActuals ? "Saving..." : "Save Returned Grades"}
                  </button>

                  {selectedDetail.comparison_rows.length > 0 ? (
                    <div className="mt-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Predicted vs Actual
                      </h5>
                      <div className="overflow-x-auto mt-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-700 text-gray-400">
                              <th className="py-2 text-left">Card</th>
                              <th className="py-2 text-left">Predicted</th>
                              <th className="py-2 text-left">Actual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedDetail.comparison_rows.map((row) => (
                              <tr key={row.item_id} className="border-b border-gray-800">
                                <td className="py-2 pr-2 text-white">{row.title}</td>
                                <td className="py-2 pr-2 text-gray-300">
                                  {row.predicted_most_likely_grade || "-"}
                                  {typeof row.predicted_probability === "number"
                                    ? ` (${(row.predicted_probability * 100).toFixed(1)}%)`
                                    : ""}
                                </td>
                                <td className="py-2 pr-2 text-gray-300">{row.actual_grade || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
