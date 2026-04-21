import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  certImageSourceForGrader,
  getItemCertGrader,
  getItemCertNumber,
  isCertImageSource,
  type CertGrader,
  type CertImageStatus,
} from "@/lib/images/cert-image";
import { isTcgapisProviderConfigured, resolveCertImage } from "@/lib/images/cert-image-resolver";
import { normalizeTrustedImageUrl } from "@/lib/images/shared";
import { syncTrustedImageFieldsForItem } from "@/lib/images/trusted-sync";
import type { CardImageSource } from "@/types";

const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_JOB_ATTEMPTS = 3;

type CollectionItemRow = {
  id: string;
  user_id: string;
  grading_company?: string | null;
  cert_number?: string | null;
  psa_cert_number?: string | null;
  image_source?: CardImageSource | null;
  image_url?: string | null;
  user_image_url?: string | null;
  cert_image_status?: CertImageStatus | null;
  cert_image_last_error?: string | null;
};

type CertImageCacheRow = {
  grader: CertGrader;
  cert_number: string;
  image_url: string | null;
  source_page_url: string | null;
  status: "resolved" | "no_image" | "failed";
  last_error: string | null;
  fetched_at: string;
  expires_at: string;
};

type CertImageJobRow = {
  id: string;
  user_id: string;
  item_id: string;
  grader: CertGrader;
  cert_number: string;
  status: CertImageStatus;
  attempts: number;
  resolved_image_url: string | null;
  source_page_url: string | null;
  last_error: string | null;
  started_at?: string | null;
};

export function buildCertImageItemUpdate(params: {
  grader: CertGrader;
  status: Exclude<CertImageStatus, "queued" | "running">;
  imageUrl?: string | null;
  lastError?: string | null;
  currentImageSource?: CardImageSource | null;
}): Pick<
  CollectionItemRow,
  "image_source" | "image_url" | "cert_image_status" | "cert_image_last_error"
> {
  const certSource = certImageSourceForGrader(params.grader);
  const normalizedImageUrl = normalizeTrustedImageUrl(params.imageUrl ?? null);

  if (params.status === "resolved" && normalizedImageUrl) {
    return {
      image_source: certSource,
      image_url: normalizedImageUrl,
      cert_image_status: "resolved",
      cert_image_last_error: null,
    };
  }

  return {
    image_source: params.currentImageSource && !isCertImageSource(params.currentImageSource)
      ? params.currentImageSource
      : "none",
    image_url: params.currentImageSource && !isCertImageSource(params.currentImageSource)
      ? null
      : null,
    cert_image_status: params.status,
    cert_image_last_error: params.lastError ?? null,
  };
}

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function isExpired(value: string | null | undefined): boolean {
  if (!value) return true;
  const parsed = Date.parse(value);
  return !Number.isFinite(parsed) || parsed <= Date.now();
}

async function getCanonicalItem(itemId: string): Promise<CollectionItemRow | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("collection_items")
    .select(
      "id,user_id,grading_company,cert_number,psa_cert_number,image_source,image_url,user_image_url,cert_image_status,cert_image_last_error"
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CollectionItemRow;
}

async function readCertImageCache(
  grader: CertGrader,
  certNumber: string
): Promise<CertImageCacheRow | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("cert_image_cache")
    .select("*")
    .eq("grader", grader)
    .eq("cert_number", certNumber)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as CertImageCacheRow;
  if (
    row.grader === "PSA" &&
    row.status !== "resolved" &&
    isTcgapisProviderConfigured() &&
    !row.last_error?.startsWith("TCGAPIS")
  ) {
    return null;
  }
  return isExpired(row.expires_at) ? null : row;
}

async function writeCertImageCache(input: {
  grader: CertGrader;
  certNumber: string;
  status: "resolved" | "no_image" | "failed";
  imageUrl?: string | null;
  sourcePageUrl?: string | null;
  lastError?: string | null;
}): Promise<void> {
  const supabase = await createServiceClient();
  const expiresAt = nowIso(
    input.status === "resolved" ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS
  );

  await supabase.from("cert_image_cache").upsert({
    grader: input.grader,
    cert_number: input.certNumber,
    image_url: normalizeTrustedImageUrl(input.imageUrl ?? null),
    source_page_url: input.sourcePageUrl ?? null,
    status: input.status,
    last_error: input.lastError ?? null,
    fetched_at: nowIso(),
    expires_at: expiresAt,
  });
}

async function applyCachedResolutionToItem(
  itemId: string,
  item: CollectionItemRow,
  cache: CertImageCacheRow
): Promise<void> {
  const supabase = await createServiceClient();
  const update = buildCertImageItemUpdate({
    grader: cache.grader,
    status: cache.status,
    imageUrl: cache.image_url,
    lastError: cache.last_error,
    currentImageSource: item.image_source ?? null,
  });

  await supabase
    .from("collection_items")
    .update(update)
    .eq("id", itemId);

  await syncTrustedImageFieldsForItem(itemId);
}

async function markItemQueued(
  itemId: string,
  currentImageSource: CardImageSource | null | undefined
): Promise<void> {
  const supabase = await createServiceClient();
  const updatePayload: Record<string, unknown> = {
    cert_image_status: "queued",
    cert_image_last_error: null,
  };

  if (isCertImageSource(currentImageSource)) {
    updatePayload.image_source = "none";
    updatePayload.image_url = null;
  }

  await supabase
    .from("collection_items")
    .update(updatePayload)
    .eq("id", itemId);

  await syncTrustedImageFieldsForItem(itemId);
}

async function findPendingJob(
  grader: CertGrader,
  certNumber: string
): Promise<CertImageJobRow | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("cert_image_resolution_jobs")
    .select("*")
    .eq("grader", grader)
    .eq("cert_number", certNumber)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as CertImageJobRow;
}

export async function enqueueCertImageResolution(params: {
  itemId: string;
}): Promise<{ jobId: string | null; status: CertImageStatus | "skipped" }> {
  const item = await getCanonicalItem(params.itemId);
  if (!item) return { jobId: null, status: "skipped" };

  const grader = getItemCertGrader(item);
  const certNumber = getItemCertNumber(item);
  if (!grader || !certNumber) {
    const supabase = await createServiceClient();
    const updatePayload: Record<string, unknown> = {
      cert_image_status: null,
      cert_image_last_error: null,
    };
    if (isCertImageSource(item.image_source ?? null)) {
      updatePayload.image_source = "none";
      updatePayload.image_url = null;
    }
    await supabase
      .from("collection_items")
      .update(updatePayload)
      .eq("id", params.itemId);
    await syncTrustedImageFieldsForItem(params.itemId);
    return { jobId: null, status: "skipped" };
  }

  const cached = await readCertImageCache(grader, certNumber);
  if (cached) {
    await applyCachedResolutionToItem(params.itemId, item, cached);
    return { jobId: null, status: cached.status };
  }

  await markItemQueued(params.itemId, item.image_source ?? null);

  const existingJob = await findPendingJob(grader, certNumber);
  if (existingJob) {
    return { jobId: existingJob.id, status: existingJob.status };
  }

  const supabase = await createServiceClient();
  const { data: createdJob, error } = await supabase
    .from("cert_image_resolution_jobs")
    .insert({
      user_id: item.user_id,
      item_id: params.itemId,
      grader,
      cert_number: certNumber,
      status: "queued",
      attempts: 0,
    })
    .select("id,status")
    .single();

  if (error || !createdJob) {
    throw error ?? new Error("Failed to create cert image resolution job");
  }

  void runCertImageResolutionJob(createdJob.id).catch((err) => {
    console.error("[cert-image] background resolution failed:", err);
  });

  return { jobId: createdJob.id, status: "queued" };
}

async function finalizeJob(
  job: CertImageJobRow,
  status: Exclude<CertImageStatus, "queued" | "running">,
  input: {
    imageUrl?: string | null;
    sourcePageUrl?: string | null;
    lastError?: string | null;
  }
): Promise<void> {
  const item = await getCanonicalItem(job.item_id);
  if (!item) return;

  const supabase = await createServiceClient();
  const itemUpdate = buildCertImageItemUpdate({
    grader: job.grader,
    status,
    imageUrl: input.imageUrl,
    lastError: input.lastError,
    currentImageSource: item.image_source ?? null,
  });

  await supabase
    .from("collection_items")
    .update(itemUpdate)
    .eq("id", job.item_id);

  await supabase
    .from("cert_image_resolution_jobs")
    .update({
      status,
      resolved_image_url: normalizeTrustedImageUrl(input.imageUrl ?? null),
      source_page_url: input.sourcePageUrl ?? null,
      last_error: input.lastError ?? null,
      finished_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", job.id);

  await syncTrustedImageFieldsForItem(job.item_id);
}

export async function runCertImageResolutionJob(jobId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("cert_image_resolution_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    if (error) throw error;
    return;
  }

  const job = data as CertImageJobRow;
  if (job.status === "resolved" || job.status === "no_image" || job.status === "failed") {
    return;
  }

  const cached = await readCertImageCache(job.grader, job.cert_number);
  if (cached) {
    await finalizeJob(job, cached.status, {
      imageUrl: cached.image_url,
      sourcePageUrl: cached.source_page_url,
      lastError: cached.last_error,
    });
    return;
  }

  let attempts = job.attempts;
  let lastError: string | null = null;

  while (attempts < MAX_JOB_ATTEMPTS) {
    attempts += 1;

    await supabase
      .from("cert_image_resolution_jobs")
      .update({
        status: "running",
        attempts,
        started_at: job.attempts === 0 ? nowIso() : job.started_at ?? nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);

    try {
      const result = await resolveCertImage({
        grader: job.grader,
        certNumber: job.cert_number,
      });

      await writeCertImageCache({
        grader: job.grader,
        certNumber: job.cert_number,
        status: result.status,
        imageUrl: result.imageUrl,
        sourcePageUrl: result.sourcePageUrl,
        lastError: result.lastError,
      });

      await finalizeJob(job, result.status, {
        imageUrl: result.imageUrl,
        sourcePageUrl: result.sourcePageUrl,
        lastError: result.lastError,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown cert image resolution error";
    }
  }

  await writeCertImageCache({
    grader: job.grader,
    certNumber: job.cert_number,
    status: "failed",
    lastError,
  });

  await finalizeJob(job, "failed", {
    lastError,
  });
}
