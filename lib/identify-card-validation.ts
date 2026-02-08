/**
 * Single source of truth for identify-card API validation.
 * Used by app/api/identify-card/route.ts only.
 */

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const ALLOWED_URL_HOSTS = [
  "supabase.co",
  "supabase.in",
];

export const DATA_URL_PATTERN = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/;

export function normalizeMimeType(mimeType: string): string {
  return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
}

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(normalizeMimeType(mimeType));
}
