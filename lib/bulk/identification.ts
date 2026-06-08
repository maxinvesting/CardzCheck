/**
 * Bulk Mode — Card Identification Service
 *
 * Abstracts over the existing extractCardIdentityDetailed pipeline.
 * Accepts image URLs (from Supabase storage), downloads them, runs AI
 * identification, and maps results to the BulkMode IdentificationResult shape.
 *
 * TODO: If live comps are available post-identification, wire them in here
 * to further refine the title candidate and confidence score.
 */

import {
  extractCardIdentityDetailed,
  type ImageInput,
} from "@/lib/card-identity";
import { isAllowedImageUrl } from "@/lib/images/imageUrlAllowlist";
import { LOW_CONFIDENCE_THRESHOLD } from "./config";
import type { IdentificationInput, IdentificationResult } from "@/types/bulk";

// Maximum image size we'll download and pass to the AI (bytes)
const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

// ----------------------------------------------------------------
// Internal: fetch an image URL and convert to base64 ImageInput
// ----------------------------------------------------------------

async function fetchImageAsInput(url: string): Promise<ImageInput | null> {
  // SSRF guard: only fetch images from our own storage / trusted CDNs. The URL
  // is client-supplied (bulk items accept a primary/secondary image URL), so an
  // unguarded fetch could be aimed at internal services or cloud metadata.
  if (!isAllowedImageUrl(url)) {
    console.warn(`[bulk/identification] Rejected non-allowlisted image URL: ${url}`);
    return null;
  }
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) {
      console.warn(`[bulk/identification] Failed to fetch image: ${url} (${response.status})`);
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    // Normalize to a supported media type
    let mediaType: ImageInput["mediaType"] = "image/jpeg";
    if (contentType.includes("png")) mediaType = "image/png";
    else if (contentType.includes("webp")) mediaType = "image/webp";

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
      console.warn(`[bulk/identification] Image too large, skipping: ${url}`);
      return null;
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { data: base64, mediaType, source: "url" };
  } catch (err) {
    console.warn(`[bulk/identification] Error fetching image: ${url}`, err);
    return null;
  }
}

// ----------------------------------------------------------------
// Map FieldConfidence string ("high" | "medium" | "low") to numeric 0–1
// ----------------------------------------------------------------

function confidenceToNumber(level: "high" | "medium" | "low"): number {
  switch (level) {
    case "high":   return 0.95;
    case "medium": return 0.72;
    case "low":    return 0.45;
  }
}

// ----------------------------------------------------------------
// Build a clean title candidate from extracted card identity
// ----------------------------------------------------------------

function buildTitleCandidate(
  player: string | null,
  year: number | null,
  setName: string | null,
  subset: string | null,
  cardNumber: string | null,
  parallel: string | null,
): string | null {
  const parts: string[] = [];

  if (year)       parts.push(String(year));
  if (setName)    parts.push(setName);
  if (subset && subset !== setName) parts.push(subset);
  if (parallel)   parts.push(parallel);
  if (player)     parts.push(player);
  if (cardNumber) parts.push(`#${cardNumber.replace(/^#/, "")}`);

  return parts.length > 0 ? parts.join(" ") : null;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Identify a card from one or two image URLs.
 *
 * Returns an IdentificationResult. On any failure, returns a safe
 * "needs_review" result with confidence=0 and no fields populated
 * so downstream logic can handle it gracefully.
 */
export async function identifyCardFromUrls(
  input: IdentificationInput
): Promise<IdentificationResult> {
  const nullResult: IdentificationResult = {
    titleCandidate: null,
    player: null,
    brand: null,
    setName: null,
    year: null,
    cardNumber: null,
    rookieFlag: false,
    insertParallelNotes: null,
    confidence: 0,
    needsReview: true,
    rawResponseJson: null,
  };

  // 1. Download images
  const primaryInput = await fetchImageAsInput(input.primaryImageUrl);
  if (!primaryInput) return nullResult;

  const imageInputs: ImageInput[] = [primaryInput];

  if (input.secondaryImageUrl) {
    const secondaryInput = await fetchImageAsInput(input.secondaryImageUrl);
    if (secondaryInput) imageInputs.push(secondaryInput);
  }

  // 2. Run AI identification
  let extractedResult;
  try {
    extractedResult = await extractCardIdentityDetailed(imageInputs);
  } catch (err) {
    console.error("[bulk/identification] extractCardIdentityDetailed failed:", err);
    return nullResult;
  }

  const { cardIdentity, vision } = extractedResult;

  // 3. Build insert/parallel notes string
  const insertParallelParts: string[] = [];
  if (vision.insert)   insertParallelParts.push(vision.insert);
  if (vision.parallel && vision.parallel !== vision.insert) {
    insertParallelParts.push(vision.parallel);
  }
  const insertParallelNotes = insertParallelParts.join(", ") || null;

  // 4. Map confidence level → numeric value
  const confidenceNumeric = confidenceToNumber(cardIdentity.confidence);

  // 5. Build title candidate
  const titleCandidate = buildTitleCandidate(
    cardIdentity.player,
    cardIdentity.year,
    cardIdentity.setName,
    cardIdentity.subset,
    cardIdentity.cardNumber,
    cardIdentity.parallel,
  );

  // 6. Determine needs_review (low confidence OR missing player)
  const needsReview =
    confidenceNumeric < LOW_CONFIDENCE_THRESHOLD ||
    !cardIdentity.player;

  return {
    titleCandidate,
    player: cardIdentity.player,
    brand: cardIdentity.brand,
    setName: cardIdentity.setName,
    year: cardIdentity.year ? String(cardIdentity.year) : null,
    cardNumber: cardIdentity.cardNumber,
    rookieFlag: cardIdentity.rookie === true,
    insertParallelNotes,
    confidence: confidenceNumeric,
    needsReview,
    rawResponseJson: {
      cardIdentity,
      vision,
    } as Record<string, unknown>,
  };
}

/**
 * Mock-safe placeholder for when ANTHROPIC_API_KEY is not set.
 * Returns a low-confidence "needs review" result with no real data.
 * Used in development without credentials or in testing contexts.
 *
 * TODO: Remove once all environments have API key configured.
 */
export function identifyCardMock(_input: IdentificationInput): IdentificationResult {
  return {
    titleCandidate: null,
    player: null,
    brand: null,
    setName: null,
    year: null,
    cardNumber: null,
    rookieFlag: false,
    insertParallelNotes: null,
    confidence: 0,
    needsReview: true,
    rawResponseJson: { mock: true, reason: "No ANTHROPIC_API_KEY configured" },
  };
}

/**
 * Entry point — automatically falls back to mock if no API key is available.
 */
export async function identifyCard(
  input: IdentificationInput
): Promise<IdentificationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[bulk/identification] ANTHROPIC_API_KEY not set; using mock identification");
    return identifyCardMock(input);
  }
  return identifyCardFromUrls(input);
}
