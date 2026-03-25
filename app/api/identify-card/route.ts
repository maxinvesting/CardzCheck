import { NextRequest, NextResponse } from "next/server";
import { extractCardIdentityDetailed, type ImageInput } from "@/lib/card-identity";
import { searchEbayDualSignal } from "@/lib/ebay";
import { smartSearch } from "@/lib/smartSearch";
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_URL_HOSTS,
  DATA_URL_PATTERN,
  isAllowedMimeType,
  MAX_IMAGE_SIZE_BYTES,
  normalizeMimeType,
} from "@/lib/identify-card-validation";
import { normalizeHttpUrl } from "@/lib/collection-images";

const INSERT_KEYWORDS = ["downtown", "kaboom", "color blast", "stained glass"];

function detectMimeFromBytes(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image/png";
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  return null;
}
const MAX_IMAGES_PER_REQUEST = 2;

type ParsedIdentifyRequest = {
  images: ImageInput[];
  requestedUrls: string[];
  includeStockImage: boolean;
};

class HttpError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

function jsonError(error: string, status: number, details?: string) {
  return NextResponse.json(
    details ? { error, details } : { error },
    { status }
  );
}

function isInsertName(value?: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return INSERT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function parseIncludeStockImage(value: unknown): boolean {
  if (typeof value !== "string") return Boolean(value);
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function formatSizeLimitError(actualBytes: number): string {
  const actualMb = (actualBytes / 1024 / 1024).toFixed(1);
  const maxMb = (MAX_IMAGE_SIZE_BYTES / 1024 / 1024).toFixed(0);
  return `Image too large: ${actualMb}MB. Maximum: ${maxMb}MB`;
}

/**
 * Validate image URL
 * Returns { valid: true } or { valid: false, error }
 */
function validateImageUrl(url: string): { valid: boolean; error?: string } {
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Image URL must use HTTPS" };
  }

  try {
    const parsedUrl = new URL(url);
    const isAllowedHost = ALLOWED_URL_HOSTS.some(
      (host) =>
        parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );

    if (!isAllowedHost) {
      return {
        valid: false,
        error: `Image URL host is not allowed: ${parsedUrl.hostname}`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Validate fetched image response
 */
function validateFetchedImage(
  contentType: string | null,
  contentLength: string | null
): { valid: boolean; error?: string; status?: number } {
  const mimeType = contentType?.split(";")[0]?.trim();
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      status: 400,
      error: `Invalid image type from URL: ${mimeType || "unknown"}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        status: 413,
        error: formatSizeLimitError(size),
      };
    }
  }

  return { valid: true };
}

async function parseMultipartRequest(request: NextRequest): Promise<ParsedIdentifyRequest> {
  const formData = await request.formData();
  const includeStockImage = parseIncludeStockImage(formData.get("includeStockImage"));

  const files = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    throw new HttpError("Upload 1-2 images.", 400);
  }

  if (files.length > MAX_IMAGES_PER_REQUEST) {
    throw new HttpError(`Upload up to ${MAX_IMAGES_PER_REQUEST} images.`, 400);
  }

  const images: ImageInput[] = [];

  for (const file of files) {
    if (!file.type || !isAllowedMimeType(file.type)) {
      throw new HttpError(
        `Invalid image type: ${file.type || "unknown"}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
        400
      );
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new HttpError(formatSizeLimitError(file.size), 413);
    }

    const imageBuffer = await file.arrayBuffer();
    if (imageBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      throw new HttpError(formatSizeLimitError(imageBuffer.byteLength), 413);
    }

    const detectedMime = detectMimeFromBytes(imageBuffer);
    if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
      throw new HttpError("Invalid image format", 400);
    }

    const mediaType = normalizeMimeType(file.type);
    if (!isAllowedMimeType(mediaType)) {
      throw new HttpError("Unsupported image format", 400);
    }

    images.push({
      data: Buffer.from(imageBuffer).toString("base64"),
      mediaType: mediaType as ImageInput["mediaType"],
      source: "base64",
    });
  }

  return { images, requestedUrls: [], includeStockImage };
}

async function parseJsonRequest(request: NextRequest): Promise<ParsedIdentifyRequest> {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((url): url is string => typeof url === "string")
    : [];

  const includeStockImage = parseIncludeStockImage(body.includeStockImage);
  const requestedUrls = imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [];

  if (requestedUrls.length === 0) {
    throw new HttpError("Missing image URL", 400);
  }

  if (requestedUrls.length > MAX_IMAGES_PER_REQUEST) {
    throw new HttpError(`Upload up to ${MAX_IMAGES_PER_REQUEST} images.`, 400);
  }

  const images: ImageInput[] = [];

  for (const url of requestedUrls) {
    images.push(await resolveImageInput(url));
  }

  return { images, requestedUrls, includeStockImage };
}

async function parseIdentifyRequest(request: NextRequest): Promise<ParsedIdentifyRequest> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return parseMultipartRequest(request);
  }

  return parseJsonRequest(request);
}

async function resolveImageInput(imageUrl: string): Promise<ImageInput> {
  if (imageUrl.startsWith("data:image/")) {
    const matches = imageUrl.match(DATA_URL_PATTERN);
    if (!matches) {
      throw new HttpError("Invalid base64 data URL format", 400);
    }

    const [, format, base64] = matches;
    const inferredMimeType = normalizeMimeType(`image/${format}`);

    if (!isAllowedMimeType(inferredMimeType)) {
      throw new HttpError("Unsupported image format", 400);
    }

    let decodedLength = 0;
    try {
      decodedLength = Buffer.from(base64, "base64").byteLength;
    } catch {
      throw new HttpError("Invalid base64 image payload", 400);
    }

    if (decodedLength > MAX_IMAGE_SIZE_BYTES) {
      throw new HttpError(formatSizeLimitError(decodedLength), 413);
    }

    return {
      data: base64,
      mediaType: inferredMimeType as ImageInput["mediaType"],
      source: "base64",
    };
  }

  const urlValidation = validateImageUrl(imageUrl);
  if (!urlValidation.valid) {
    throw new HttpError(urlValidation.error || "Invalid URL", 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new HttpError("Invalid URL format", 400);
  }

  let headResponse: Response;
  try {
    headResponse = await fetch(parsedUrl.toString(), { method: "HEAD" });
  } catch {
    throw new HttpError("Unable to fetch image metadata", 400);
  }

  if (!headResponse.ok) {
    throw new HttpError("Image URL is not accessible", 400);
  }

  const headContentType = normalizeMimeType(
    (headResponse.headers.get("content-type") || "").split(";")[0]
  );

  if (!headContentType || !isAllowedMimeType(headContentType)) {
    throw new HttpError("Unsupported image format", 400);
  }

  const contentLengthHeader = headResponse.headers.get("content-length");
  if (!contentLengthHeader) {
    throw new HttpError("Image size could not be determined", 400);
  }

  const headContentLength = Number(contentLengthHeader);
  if (!Number.isFinite(headContentLength)) {
    throw new HttpError("Image size could not be determined", 400);
  }
  if (headContentLength > MAX_IMAGE_SIZE_BYTES) {
    throw new HttpError(formatSizeLimitError(headContentLength), 413);
  }

  const imageResponse = await fetch(parsedUrl.toString());
  if (!imageResponse.ok) {
    throw new HttpError("Failed to download image", 400);
  }

  const fetchValidation = validateFetchedImage(
    imageResponse.headers.get("content-type"),
    imageResponse.headers.get("content-length")
  );
  if (!fetchValidation.valid) {
    throw new HttpError(fetchValidation.error || "Invalid image", fetchValidation.status || 400);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  if (imageBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
    throw new HttpError(formatSizeLimitError(imageBuffer.byteLength), 413);
  }

  const detectedMime = detectMimeFromBytes(imageBuffer);
  if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
    throw new HttpError("Invalid image format", 400);
  }

  const normalizedContentType = normalizeMimeType(
    (imageResponse.headers.get("content-type") || "").split(";")[0]
  );
  if (!normalizedContentType || !isAllowedMimeType(normalizedContentType)) {
    throw new HttpError("Unsupported image format", 400);
  }

  return {
    data: Buffer.from(imageBuffer).toString("base64"),
    mediaType: normalizedContentType as ImageInput["mediaType"],
    source: "url",
  };
}

async function resolveStockImageUrls(
  cardIdentity: {
    player: string | null;
    year: number | null;
    setName: string | null;
    subset: string | null;
    parallel: string | null;
  },
  requestedUrls: string[],
  includeStockImage: boolean
): Promise<{ stockImageUrl: string | null; ebayImageUrl: string | null }> {
  const fallbackUrl = requestedUrls.find((url) => normalizeHttpUrl(url)) || null;

  if (!includeStockImage) {
    return {
      stockImageUrl: fallbackUrl,
      ebayImageUrl: null,
    };
  }

  const player = (cardIdentity.player ?? "").trim();
  if (!player) {
    return {
      stockImageUrl: fallbackUrl,
      ebayImageUrl: null,
    };
  }

  // Prefer eBay Browse API (best-match sorted) for stock image
  try {
    const params = {
      player,
      year: cardIdentity.year != null ? String(cardIdentity.year) : undefined,
      set: [cardIdentity.setName, cardIdentity.subset].filter(Boolean).join(" ").trim() || undefined,
      parallelType: (cardIdentity.parallel ?? "").trim() || undefined,
      limit: 15,
    };

    const response = await searchEbayDualSignal(params);
    const bestMatch = response.forSale?.items?.find(
      (item) => item.image && normalizeHttpUrl(item.image)
    );
    const ebayImageUrl = bestMatch?.image ? normalizeHttpUrl(bestMatch.image) : null;

    if (ebayImageUrl) {
      return {
        stockImageUrl: ebayImageUrl,
        ebayImageUrl,
      };
    }
  } catch (error) {
    console.warn("[identify-card] eBay Browse API stock image lookup failed", error);
  }

  // Fallback: sold comps from smartSearch (may still have images)
  try {
    const queryParts = [
      player,
      cardIdentity.year ? String(cardIdentity.year) : null,
      cardIdentity.setName,
      cardIdentity.subset,
      cardIdentity.parallel,
    ].filter((part): part is string => Boolean(part && part.trim()));

    if (queryParts.length > 0) {
      const smart = await smartSearch(queryParts.join(" "), "collection", {
        limit: 8,
        candidateLimit: 50,
        source: "ebayCollection",
      });

      const compImage =
        smart.rawComps?.find(
          (comp) => typeof comp.image === "string" && normalizeHttpUrl(comp.image)
        )?.image || null;
      const ebayImageUrl = compImage ? normalizeHttpUrl(compImage) : null;

      if (ebayImageUrl) {
        return {
          stockImageUrl: ebayImageUrl,
          ebayImageUrl,
        };
      }
    }
  } catch (error) {
    console.warn("[identify-card] smartSearch stock image fallback failed", error);
  }

  return {
    stockImageUrl: fallbackUrl,
    ebayImageUrl: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseIdentifyRequest(request);

    if (parsed.images.length === 0) {
      throw new HttpError("Upload 1-2 images.", 400);
    }

    const { cardIdentity, vision } = await extractCardIdentityDetailed(parsed.images);

    if (cardIdentity.year) {
      console.info(
        `[identify-card] year=${cardIdentity.year} source=${cardIdentity.sources.year ?? "unknown"} confidence=${cardIdentity.fieldConfidence.year ?? "low"}`
      );
    } else if (
      cardIdentity.warnings.some((warning) => warning.toLowerCase().includes("year"))
    ) {
      console.info(`[identify-card] year unset: ${cardIdentity.warnings.join(" | ")}`);
    }

    const playerName = cardIdentity.player ?? "";
    const players = playerName ? [playerName] : [];
    const insertCandidate = isInsertName(cardIdentity.subset ?? undefined)
      ? cardIdentity.subset ?? undefined
      : undefined;
    const variantCandidate = cardIdentity.parallel ?? undefined;

    const { stockImageUrl, ebayImageUrl } = await resolveStockImageUrls(
      {
        player: cardIdentity.player,
        year: cardIdentity.year,
        setName: cardIdentity.setName,
        subset: cardIdentity.subset,
        parallel: cardIdentity.parallel,
      },
      parsed.requestedUrls,
      parsed.includeStockImage
    );

    return NextResponse.json({
      player_name: playerName,
      players,
      year: cardIdentity.year ? String(cardIdentity.year) : "",
      set_name: cardIdentity.setName ?? "",
      insert: insertCandidate ?? "",
      variant: variantCandidate ?? "",
      grade: vision.grade ?? "",
      confidence: cardIdentity.confidence,
      stock_image_url: stockImageUrl,
      ebay_image_url: ebayImageUrl,
      card_identity: cardIdentity,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status, error.details);
    }

    console.error("Card identification error:", error);
    return jsonError(
      "Failed to identify card",
      500,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
