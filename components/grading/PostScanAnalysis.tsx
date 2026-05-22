"use client";

import { useMemo, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import GradeEstimatorValuePanel from "@/components/GradeEstimatorValuePanel";
import PreSubmissionAnalysisSection from "@/components/grading/PreSubmissionAnalysisSection";
import { gradingCopy } from "@/copy/grading";
import { buildCompsLinks, type CompsParams } from "@/lib/ebay/comps-url";
import {
  getHalfPointOutcomes,
  HALF_POINT_GRADER_ROWS,
} from "@/lib/grading/graderDistributionUi";
import {
  distributionFromRange,
  normalizePsaDistribution,
  type GradeOutcome,
} from "@/lib/grading/gradeProbability";
import { openGradeReportPdf } from "@/lib/grading/exportGradeProbabilityImage";
import {
  buildGradeVerdict,
  type VerdictCardIdentity,
} from "@/lib/grading/verdict";
import {
  GRADE_SCAN_KIND_LABELS,
  normalizeGradeScanPhotos,
} from "@/lib/grading/scanPhotos";
import { normalizeProbabilities } from "@/lib/grade-estimator/value";
import type {
  GradeEstimate,
  GradeEstimatorHistoryRun,
  GradeProbabilities,
  GradeScanPhoto,
  GradeScanPhotoKind,
} from "@/types";

type PostScanSessionSummary = {
  activeSlots: number;
  cardTitle?: string | null;
  gradingCompany?: "PSA" | "BGS" | "SGC" | string | null;
  notes?: string | null;
  quickFlags?: string[] | null;
  createdAt?: string | null;
};

interface PostScanAnalysisProps {
  runs: GradeEstimatorHistoryRun[];
  session: PostScanSessionSummary;
  gradeHubBasePath: string;
  scanPath: string;
  standaloneHref?: string | null;
  error?: string | null;
  title?: string;
  description?: string;
}

const PSA_ORDER = ["PSA 10", "PSA 9", "PSA 8", "PSA 7 or lower"];
const SERVICE_ACCENTS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];

function formatGradeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatRange(estimate: GradeEstimate): string {
  const low = estimate.estimated_grade_low;
  const high = estimate.estimated_grade_high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "Grade unavailable";
  return low === high ? `PSA ${formatGradeNumber(low)}` : `PSA ${formatGradeNumber(low)}-${formatGradeNumber(high)}`;
}

function buildRangeLabel(estimate: GradeEstimate): string | null {
  const low = estimate.estimated_grade_low;
  const high = estimate.estimated_grade_high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return low === high ? `PSA ${formatGradeNumber(low)}` : `PSA ${formatGradeNumber(low)}-${formatGradeNumber(high)}`;
}

function formatSessionDate(iso?: string | null): string {
  if (!iso) return "Not saved";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

function expectedValue(outcomes: GradeOutcome[]): number | null {
  if (!outcomes.some((outcome) => outcome.probability > 0)) return null;
  const gradeMap: Record<string, number> = {
    "PSA 10": 10,
    "PSA 9": 9,
    "PSA 8": 8,
    "PSA 7 or lower": 7,
  };
  return outcomes.reduce((sum, outcome) => sum + (gradeMap[outcome.label] ?? 0) * outcome.probability, 0);
}

function mostLikely(outcomes: GradeOutcome[]): GradeOutcome | null {
  const populated = outcomes.filter((outcome) => outcome.probability > 0);
  if (populated.length === 0) return null;
  return populated.reduce((max, outcome) => (outcome.probability > max.probability ? outcome : max));
}

function mapToPsaBuckets(outcomes: GradeOutcome[]): GradeOutcome[] {
  const map = new Map(PSA_ORDER.map((label) => [label, 0]));
  outcomes.forEach((outcome) => {
    const normalized = outcome.label.toUpperCase();
    let bucket = "PSA 7 or lower";
    if (normalized.includes("10")) bucket = "PSA 10";
    else if (normalized.includes("9")) bucket = "PSA 9";
    else if (normalized.includes("8")) bucket = "PSA 8";
    map.set(bucket, (map.get(bucket) ?? 0) + outcome.probability);
  });
  return PSA_ORDER.map((label) => ({ label, probability: map.get(label) ?? 0 }));
}

function getPsaOutcomes(estimate: GradeEstimate): GradeOutcome[] {
  if (estimate.grade_probabilities?.psa) {
    return normalizePsaDistribution(
      [
        { label: "PSA 10", probability: estimate.grade_probabilities.psa["10"] },
        { label: "PSA 9", probability: estimate.grade_probabilities.psa["9"] },
        { label: "PSA 8", probability: estimate.grade_probabilities.psa["8"] },
        { label: "PSA 7 or lower", probability: estimate.grade_probabilities.psa["7_or_lower"] },
      ],
      { allowPsa10Override: true }
    );
  }

  const rangeLabel = buildRangeLabel(estimate);
  if (!rangeLabel) return PSA_ORDER.map((label) => ({ label, probability: 0 }));
  return normalizePsaDistribution(
    mapToPsaBuckets(distributionFromRange(rangeLabel, estimate.grade_probabilities?.confidence)),
    { allowPsa10Override: true }
  );
}

function resolveFullProbabilities(estimate: GradeEstimate): GradeProbabilities | null {
  if (!estimate.grade_probabilities?.psa) return null;
  return normalizeProbabilities(estimate.grade_probabilities as GradeProbabilities);
}

function buildCardIdentity(run: GradeEstimatorHistoryRun, sessionTitle?: string | null): VerdictCardIdentity {
  return {
    owner_declared_title: sessionTitle?.trim() || undefined,
    player_name: run.card.player_name,
    year: run.card.year,
    set_name: run.card.set_name,
    parallel_type: run.card.parallel_type,
    variation: run.card.variation,
    insert: run.card.insert,
    card_number: run.card.card_number,
  };
}

function buildCardTitle(run: GradeEstimatorHistoryRun, sessionTitle?: string | null): string {
  if (run.card.player_name?.trim()) return run.card.player_name.trim();
  if (sessionTitle?.trim()) return sessionTitle.trim();
  return "Scanned card";
}

function buildCardMeta(run: GradeEstimatorHistoryRun): string {
  return [
    run.card.year,
    run.card.set_name,
    run.card.parallel_type,
    run.card.card_number ? `#${run.card.card_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function compsParamsForCard(cardIdentity: NonNullable<VerdictCardIdentity>): CompsParams {
  const owner = cardIdentity.owner_declared_title?.trim();
  if (owner) return { title: owner };
  return {
    player: cardIdentity.player_name,
    year: cardIdentity.year,
    setName: cardIdentity.set_name,
    parallel: cardIdentity.parallel_type,
  };
}

function normalizeRunPhotos(run: GradeEstimatorHistoryRun): GradeScanPhoto[] {
  const fromScan = normalizeGradeScanPhotos(run.card.scanPhotos ?? undefined);
  if (fromScan.length > 0) return fromScan;

  const urls = [
    ...(run.card.imageUrls ?? []),
    run.card.imageUrl,
  ].filter((url): url is string => Boolean(url?.trim()));

  return normalizeGradeScanPhotos(
    Array.from(new Set(urls)).map((url, index) => ({
      url,
      kind: index === 0 ? "front" : index === 1 ? "back" : "other",
      sort_order: index,
    }))
  );
}

function sourceKinds(kinds?: GradeScanPhotoKind[]): string {
  if (!kinds?.length) return "";
  return Array.from(new Set(kinds.map((kind) => GRADE_SCAN_KIND_LABELS[kind] ?? kind))).join(", ");
}

function qualitySummary(estimate: GradeEstimate): string {
  const quality = estimate.image_quality;
  if (!quality) return "Not provided";
  const score = typeof quality.overall_image_score === "number" ? `${quality.overall_image_score}/100` : null;
  const issues = quality.key_issues?.filter(Boolean).join(", ");
  return [score, issues].filter(Boolean).join(" · ") || "Not provided";
}

function notProvided(value?: string | null): string {
  return value?.trim() ? value.trim() : "Not provided";
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
        : "border-white/10 bg-white/[0.04] text-white";

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-tight">{value}</p>
    </div>
  );
}

function ProbabilityRow({
  label,
  probability,
  accent,
  highlighted,
}: {
  label: string;
  probability: number;
  accent: string;
  highlighted?: boolean;
}) {
  const percent = Math.round(probability * 100);
  return (
    <div className={percent === 0 ? "opacity-45" : ""}>
      <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
        <span className={`min-w-0 text-sm leading-tight ${highlighted ? "font-semibold text-white" : "text-white/68"}`}>
          {label}
        </span>
        <span className={`text-right font-mono text-sm ${highlighted ? "text-white" : "text-white/55"}`}>
          {percent}%
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full ${accent}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ProbabilityCard({
  title,
  outcomes,
  accent,
  perspective,
}: {
  title: string;
  outcomes: GradeOutcome[];
  accent: string;
  perspective?: string;
}) {
  const likely = mostLikely(outcomes);
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/72">{title}</h4>
        {likely ? (
          <p className="text-xs text-white/45">
            Top: <span className="font-medium text-white/80">{likely.label}</span> {formatPercent(likely.probability)}
          </p>
        ) : null}
      </div>
      <div className="space-y-3">
        {outcomes.map((outcome) => (
          <ProbabilityRow
            key={outcome.label}
            label={outcome.label}
            probability={outcome.probability}
            highlighted={outcome.label === likely?.label}
            accent={accent}
          />
        ))}
      </div>
      {perspective ? <p className="mt-4 text-xs leading-relaxed text-white/45">{perspective}</p> : null}
    </section>
  );
}

function EvidenceItem({
  label,
  value,
  detail,
}: {
  label: string;
  value?: string | null;
  detail?: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-white/78">{notProvided(value)}</p>
      {detail?.trim() ? <p className="mt-2 text-xs leading-relaxed text-white/42">{detail}</p> : null}
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      {children}
    </a>
  );
}

function CardGallery({ photos, title }: { photos: GradeScanPhoto[]; title: string }) {
  const primary = photos[0];
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1220] p-3">
      {primary ? (
        <div className="relative mx-auto aspect-[3/4] max-h-[520px] w-full overflow-hidden rounded-md bg-black/30">
          <Image
            src={primary.url}
            alt={`${title} ${GRADE_SCAN_KIND_LABELS[primary.kind] ?? "photo"}`}
            fill
            unoptimized
            className="object-contain"
            sizes="(min-width: 1024px) 34vw, 100vw"
          />
        </div>
      ) : (
        <div className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-white/12 bg-white/[0.03] text-sm text-white/35">
          No image available
        </div>
      )}

      {photos.length > 1 ? (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4">
          {photos.slice(0, 8).map((photo, index) => (
            <div key={`${photo.url}-${index}`} className="min-w-0">
              <div className="relative aspect-[3/4] overflow-hidden rounded border border-white/10 bg-black/25">
                <Image
                  src={photo.url}
                  alt={`${title} ${GRADE_SCAN_KIND_LABELS[photo.kind] ?? `photo ${index + 1}`}`}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="96px"
                />
              </div>
              <p className="mt-1 truncate text-[10px] text-white/42">
                {GRADE_SCAN_KIND_LABELS[photo.kind] ?? `Photo ${index + 1}`}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResultAnchorCard({
  run,
  index,
  sessionTitle,
}: {
  run: GradeEstimatorHistoryRun;
  index: number;
  sessionTitle?: string | null;
}) {
  const photos = normalizeRunPhotos(run);
  const title = buildCardTitle(run, sessionTitle);
  const psaOutcomes = getPsaOutcomes(run.estimate);
  const likely = mostLikely(psaOutcomes);

  return (
    <a
      href={`#post-scan-result-${index + 1}`}
      className="flex min-w-0 gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 transition-colors hover:bg-white/[0.06]"
    >
      {photos[0] ? (
        <Image
          src={photos[0].url}
          alt={title}
          width={56}
          height={76}
          unoptimized
          className="h-[76px] w-14 shrink-0 rounded border border-white/10 object-cover"
        />
      ) : (
        <div className="h-[76px] w-14 shrink-0 rounded border border-white/10 bg-white/[0.04]" />
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">Result {index + 1}</p>
        <p className="mt-1 truncate text-sm font-semibold text-white">{title}</p>
        {buildCardMeta(run) ? <p className="mt-1 truncate text-xs text-white/45">{buildCardMeta(run)}</p> : null}
        <p className="mt-2 text-xs text-white/60">
          {likely ? `${likely.label} · ${formatPercent(likely.probability)}` : formatRange(run.estimate)}
        </p>
      </div>
    </a>
  );
}

function RunAnalysisCard({
  run,
  index,
  sessionTitle,
}: {
  run: GradeEstimatorHistoryRun;
  index: number;
  sessionTitle?: string | null;
}) {
  const cardIdentity = buildCardIdentity(run, sessionTitle);
  const title = buildCardTitle(run, sessionTitle);
  const meta = buildCardMeta(run);
  const photos = normalizeRunPhotos(run);
  const psaOutcomes = getPsaOutcomes(run.estimate);
  const likely = mostLikely(psaOutcomes);
  const ev = expectedValue(psaOutcomes);
  const fullProbabilities = useMemo(() => resolveFullProbabilities(run.estimate), [run.estimate]);
  const verdict = useMemo(() => buildGradeVerdict(run.estimate, cardIdentity), [run.estimate, cardIdentity]);
  const compsLinks = buildCompsLinks(compsParamsForCard(cardIdentity ?? {}));
  const confidence = run.estimate.grade_probabilities?.confidence ?? run.estimate.confidence?.confidence_label ?? null;
  const visibility = run.estimate.visibility_notes?.filter(Boolean).join(" ");
  const analysisAvailable = psaOutcomes.some((outcome) => outcome.probability > 0);

  const handlePdf = () => {
    openGradeReportPdf({
      estimate: run.estimate,
      cardIdentity,
      primaryImageUrl: photos[0]?.url ?? run.card.imageUrl,
      imageUrls: photos.map((photo) => photo.url),
      generatedAt: new Date().toISOString(),
      slabId: run.id,
    });
  };

  return (
    <section id={`post-scan-result-${index + 1}`} className="scroll-mt-24 rounded-xl border border-white/10 bg-[#0c1626] p-4 shadow-none sm:p-5">
      <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">Result {index + 1}</p>
          <h3 className="mt-1 text-2xl font-semibold leading-tight text-white">{title}</h3>
          {meta ? <p className="mt-2 text-sm text-white/52">{meta}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/78">
            Saved {formatSessionDate(run.created_at)}
          </span>
          {confidence ? (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase text-amber-100">
              {confidence} confidence
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
        <CardGallery photos={photos} title={title} />

        <div className="space-y-5">
          {analysisAvailable ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Estimated Range" value={formatRange(run.estimate)} />
                <StatCard label="Most Likely" value={likely ? `${likely.label} ${formatPercent(likely.probability)}` : "Unavailable"} />
                <StatCard label="Expected Value" value={ev === null ? "Unavailable" : `PSA ${ev.toFixed(1)}`} />
                <StatCard
                  label="Recommendation"
                  value={verdict.recommendation}
                  tone={verdict.recommendation === "Grade" ? "good" : verdict.recommendation === "Sell Raw" ? "neutral" : "warn"}
                />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Verdict</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/76">{verdict.reasoning}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/72">
                    Suggested grader: {verdict.suggestedGrader}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <ProbabilityCard
                  title="PSA"
                  outcomes={psaOutcomes}
                  accent={SERVICE_ACCENTS[0]}
                  perspective={run.estimate.grader_perspectives?.psa}
                />
                {fullProbabilities
                  ? HALF_POINT_GRADER_ROWS.map((row, rowIndex) => (
                      <ProbabilityCard
                        key={row.key}
                        title={row.title}
                        outcomes={getHalfPointOutcomes(fullProbabilities, row.labels, row.key)}
                        accent={SERVICE_ACCENTS[rowIndex + 1] ?? SERVICE_ACCENTS[0]}
                        perspective={run.estimate.grader_perspectives?.[row.perspectiveField]}
                      />
                    ))
                  : null}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-100">Analysis unavailable</p>
              <p className="mt-2 text-sm leading-relaxed text-amber-100/75">
                The scan finished, but this result did not include enough grade probability data to render a distribution.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <EvidenceItem
              label="Centering"
              value={run.estimate.centering}
              detail={
                run.estimate.centering_detail
                  ? `L/R ${run.estimate.centering_detail.left_right_ratio ?? "-"} · T/B ${run.estimate.centering_detail.top_bottom_ratio ?? "-"}`
                  : null
              }
            />
            <EvidenceItem
              label="Corners"
              value={run.estimate.corners}
              detail={sourceKinds(run.estimate.evidence_photo_sources?.corners)}
            />
            <EvidenceItem
              label="Surface"
              value={run.estimate.surface}
              detail={
                run.estimate.surface_findings?.length
                  ? run.estimate.surface_findings
                      .slice(0, 3)
                      .map((finding) => `${finding.issue_type.replace(/_/g, " ")} severity ${finding.severity_0_3}/3`)
                      .join(" · ")
                  : sourceKinds(run.estimate.evidence_photo_sources?.surface)
              }
            />
            <EvidenceItem
              label="Edges"
              value={run.estimate.edges}
              detail={sourceKinds(run.estimate.evidence_photo_sources?.edges)}
            />
            <EvidenceItem label="Image Quality" value={qualitySummary(run.estimate)} />
            <EvidenceItem label="Visibility" value={visibility || run.estimate.analysis_reason} />
            <EvidenceItem label="Model Notes" value={run.estimate.grade_notes} />
            <EvidenceItem label="Disclaimer" value={gradingCopy.panel.disclaimer} />
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionLink href={compsLinks.psa10Url}>PSA 10 sold</ActionLink>
            <ActionLink href={compsLinks.psa9Url}>PSA 9 sold</ActionLink>
            <ActionLink href={compsLinks.rawUrl}>Raw sold</ActionLink>
            <button
              type="button"
              onClick={handlePdf}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              PDF report
            </button>
          </div>
        </div>
      </div>

      {run.post_grading_value ? (
        <div className="mt-5">
          <GradeEstimatorValuePanel result={run.post_grading_value} flat />
        </div>
      ) : null}

      {cardIdentity?.player_name ? (
        <div className="mt-5">
          <PreSubmissionAnalysisSection estimate={run.estimate} cardIdentity={cardIdentity} />
        </div>
      ) : null}
    </section>
  );
}

export default function PostScanAnalysis({
  runs,
  session,
  gradeHubBasePath,
  scanPath,
  standaloneHref,
  error,
  title = "Post-scan card analysis",
  description = "Grade probability, card evidence, and value guidance from the completed scan.",
}: PostScanAnalysisProps) {
  const createdAt = session.createdAt ?? runs[0]?.created_at ?? null;
  const activeSlots = session.activeSlots || runs.length || 1;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-white/10 bg-[#0c1626] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300/70">Scan complete</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={gradeHubBasePath} className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 px-4 text-sm font-semibold text-white/75 hover:bg-white/[0.06]">
              Back to Hub
            </Link>
            {standaloneHref ? (
              <Link href={standaloneHref} className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 px-4 text-sm font-semibold text-white/75 hover:bg-white/[0.06]">
                Open standalone results
              </Link>
            ) : null}
            <Link href={scanPath} className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--biz-primary)] px-4 text-sm font-semibold text-white hover:bg-[#17896A]">
              New Scan
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Cards" value={`${activeSlots}`} />
          <StatCard label="Target Grader" value={session.gradingCompany || "PSA"} />
          <StatCard label="Saved" value={formatSessionDate(createdAt)} />
          <StatCard label="Results Loaded" value={`${runs.length}`} />
        </div>

        {session.cardTitle?.trim() || session.notes?.trim() || session.quickFlags?.length ? (
          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-4">
            {session.cardTitle?.trim() ? (
              <p className="text-sm font-semibold text-white">{session.cardTitle.trim()}</p>
            ) : null}
            {session.notes?.trim() ? (
              <p className="mt-2 text-sm leading-relaxed text-white/58">{session.notes.trim()}</p>
            ) : null}
            {session.quickFlags?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {session.quickFlags.map((flag) => (
                  <span key={flag} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                    {flag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {runs.length > 1 ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((run, index) => (
            <ResultAnchorCard key={run.id} run={run} index={index} sessionTitle={session.cardTitle} />
          ))}
        </section>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        {runs.map((run, index) => (
          <RunAnalysisCard key={run.id} run={run} index={index} sessionTitle={session.cardTitle} />
        ))}
      </div>
    </div>
  );
}
