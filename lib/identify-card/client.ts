import type { CardIdentificationResponse } from "@/types";

export const IDENTIFY_MAX_IMAGES = 2;

export type SafeJsonResult<T> = {
  data: T | null;
  rawText: string;
};

export async function safeJson<T = unknown>(res: Response): Promise<SafeJsonResult<T>> {
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    return { data: null, rawText };
  }

  try {
    return {
      data: JSON.parse(trimmed) as T,
      rawText,
    };
  } catch {
    return { data: null, rawText };
  }
}

export interface IdentifyCardFromImagesArgs {
  files?: File[];
  imageUrl?: string;
  imageUrls?: string[];
  includeStockImage?: boolean;
  signal?: AbortSignal;
}

export interface IdentifyCardClientResult {
  ok: boolean;
  status: number;
  data: CardIdentificationResponse | null;
  rawText: string;
  errorMessage: string | null;
}

function toReadableRawSnippet(rawText: string): string | null {
  const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 160);
  return snippet || null;
}

function getErrorMessage(
  parsed: CardIdentificationResponse | null,
  rawText: string,
  fallback = "Failed to identify card"
): string {
  const nestedError =
    parsed &&
    typeof parsed === "object" &&
    "data" in parsed &&
    typeof (parsed as { data?: { error?: unknown } }).data?.error === "string"
      ? (parsed as { data: { error: string } }).data.error
      : null;

  if (nestedError) return nestedError;

  const directError =
    parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    typeof (parsed as { error?: unknown }).error === "string"
      ? (parsed as { error: string }).error
      : null;

  if (directError) {
    const directReason =
      parsed &&
      typeof parsed === "object" &&
      "reason" in parsed &&
      typeof (parsed as { reason?: unknown }).reason === "string"
        ? (parsed as { reason: string }).reason
        : null;
    return directReason ? `${directError}: ${directReason}` : directError;
  }

  return toReadableRawSnippet(rawText) || fallback;
}

export async function identifyCardFromImages(
  args: IdentifyCardFromImagesArgs
): Promise<IdentifyCardClientResult> {
  const files = (args.files ?? []).filter(Boolean).slice(0, IDENTIFY_MAX_IMAGES);
  const hasFiles = files.length > 0;

  const requestInit: RequestInit = {
    method: "POST",
    signal: args.signal,
  };

  if (hasFiles) {
    const formData = new FormData();
    for (const file of files) {
      formData.append("images", file);
    }
    if (args.includeStockImage) {
      formData.append("includeStockImage", "1");
    }
    requestInit.body = formData;
  } else {
    const imageUrls = Array.isArray(args.imageUrls)
      ? args.imageUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    const payload = imageUrls.length > 0
      ? { imageUrls, includeStockImage: Boolean(args.includeStockImage) }
      : { imageUrl: args.imageUrl, includeStockImage: Boolean(args.includeStockImage) };

    requestInit.headers = { "Content-Type": "application/json" };
    requestInit.body = JSON.stringify(payload);
  }

  const response = await fetch("/api/identify-card", requestInit);
  const parsed = await safeJson<CardIdentificationResponse>(response);
  const hasApiError =
    parsed.data && typeof parsed.data === "object" && "error" in parsed.data;

  const errorMessage =
    !response.ok || hasApiError
      ? getErrorMessage(parsed.data, parsed.rawText)
      : null;

  return {
    ok: response.ok && !hasApiError,
    status: response.status,
    data: parsed.data,
    rawText: parsed.rawText,
    errorMessage,
  };
}
