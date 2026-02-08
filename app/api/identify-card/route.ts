import { NextRequest, NextResponse } from "next/server";
import { extractCardIdentityDetailed, type ImageInput } from "@/lib/card-identity";
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_URL_HOSTS,
  DATA_URL_PATTERN,
  isAllowedMimeType,
  MAX_IMAGE_SIZE_BYTES,
  normalizeMimeType,
} from "@/lib/identify-card-validation";

/**
 * Validate image URL
 * Returns { valid: true } or { valid: false, error }
 */
function validateImageUrl(url: string): { valid: boolean; error?: string } {
  // Must be HTTPS
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Image URL must use HTTPS" };
  }

  try {
    const parsedUrl = new URL(url);

    // Check if host is allowed (Supabase storage or similar trusted sources)
    const isAllowedHost = ALLOWED_URL_HOSTS.some(
      (host) =>
        parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );

    if (!isAllowedHost) {
      // For now, allow any HTTPS URL but log a warning
      // In production, you may want to restrict to known hosts only
      console.warn(
        `[identify-card] URL from untrusted host: ${parsedUrl.hostname}`
      );
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
): { valid: boolean; error?: string } {
  // Validate content type
  const mimeType = contentType?.split(";")[0]?.trim();
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid image type from URL: ${mimeType || "unknown"}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  // Validate size if Content-Length header is present
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Image too large: ${(size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`,
      };
    }
  }

  return { valid: true };
}

const INSERT_KEYWORDS = ["downtown", "kaboom", "color blast", "stained glass"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : undefined;
    const imageUrls = Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter((url: unknown) => typeof url === "string")
      : [];

    const requestedUrls = imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [];

    if (requestedUrls.length === 0) {
      return NextResponse.json(
        { error: "Missing image URL" },
        { status: 400 }
      );
    }

    const images: ImageInput[] = [];
    try {
      for (const url of requestedUrls) {
        const image = await resolveImageInput(url);
        images.push(image);
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid image",
          reason: error instanceof Error ? error.message : "Unsupported image format or size",
        },
        { status: 400 }
      );
    }

    const { cardIdentity, vision } = await extractCardIdentityDetailed(images);

    if (cardIdentity.year) {
      console.info(
        `[identify-card] year=${cardIdentity.year} source=${cardIdentity.sources.year ?? "unknown"} confidence=${cardIdentity.fieldConfidence.year ?? "low"}`
      );
    } else if (cardIdentity.warnings.some((warning) => warning.toLowerCase().includes("year"))) {
      console.info(`[identify-card] year unset: ${cardIdentity.warnings.join(" | ")}`);
    }

    const playerName = cardIdentity.player ?? "";
    const players = playerName ? [playerName] : [];
    const insertCandidate = isInsertName(cardIdentity.subset ?? undefined) ? cardIdentity.subset ?? undefined : undefined;
    const variantCandidate = cardIdentity.parallel ?? undefined;

    return NextResponse.json({
      player_name: playerName,
      players,
      year: cardIdentity.year ? String(cardIdentity.year) : "",
      set_name: cardIdentity.setName ?? "",
      insert: insertCandidate ?? "",
      variant: variantCandidate ?? "",
      grade: vision.grade ?? "",
      confidence: cardIdentity.confidence,
      card_identity: cardIdentity,
    });
  } catch (error) {
    console.error("Card identification error:", error);
    return NextResponse.json(
      { error: "Failed to identify card", reason: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function isInsertName(value?: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return INSERT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function resolveImageInput(imageUrl: string): Promise<ImageInput> {
  if (imageUrl.startsWith("data:image/")) {
    const matches = imageUrl.match(DATA_URL_PATTERN);
    if (!matches) {
      throw new Error("Invalid base64 data URL format");
    }
    const [, format, base64] = matches;
    const inferredMimeType = normalizeMimeType(`image/${format}`);
    if (!isAllowedMimeType(inferredMimeType)) {
      throw new Error("Unsupported image format or size");
    }

    let decodedLength = 0;
    try {
      decodedLength = Buffer.from(base64, "base64").byteLength;
    } catch {
      throw new Error("Unsupported image format or size");
    }

    if (decodedLength > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("Unsupported image format or size");
    }

    return {
      data: base64,
      mediaType: inferredMimeType as ImageInput["mediaType"],
      source: "base64",
    };
  }

  const urlValidation = validateImageUrl(imageUrl);
  if (!urlValidation.valid) {
    throw new Error(urlValidation.error || "Invalid URL");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  let headResponse: Response;
  try {
    headResponse = await fetch(parsedUrl.toString(), { method: "HEAD" });
  } catch {
    throw new Error("Unsupported image format or size");
  }

  if (!headResponse.ok) {
    throw new Error("Unsupported image format or size");
  }

  const headContentType = normalizeMimeType(
    (headResponse.headers.get("content-type") || "").split(";")[0]
  );
  if (!headContentType || !isAllowedMimeType(headContentType)) {
    throw new Error("Unsupported image format or size");
  }

  const contentLengthHeader = headResponse.headers.get("content-length");
  if (!contentLengthHeader) {
    throw new Error("Unsupported image format or size");
  }
  const headContentLength = Number(contentLengthHeader);
  if (!Number.isFinite(headContentLength) || headContentLength > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Unsupported image format or size");
  }

  const imageResponse = await fetch(parsedUrl.toString());
  if (!imageResponse.ok) {
    throw new Error("Unsupported image format or size");
  }

  const fetchContentType = imageResponse.headers.get("content-type");
  const fetchContentLength = imageResponse.headers.get("content-length");
  const fetchValidation = validateFetchedImage(fetchContentType, fetchContentLength);
  if (!fetchValidation.valid) {
    throw new Error(fetchValidation.error || "Invalid image");
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  if (imageBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Unsupported image format or size");
  }
  const base64Image = Buffer.from(imageBuffer).toString("base64");

  const normalizedContentType = normalizeMimeType(
    (imageResponse.headers.get("content-type") || "").split(";")[0]
  );
  if (!normalizedContentType || !isAllowedMimeType(normalizedContentType)) {
    throw new Error("Unsupported image format or size");
  }

  return {
    data: base64Image,
    mediaType: normalizedContentType as ImageInput["mediaType"],
    source: "url",
  };
}
