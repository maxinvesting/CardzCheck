/**
 * Bulk Mode — Client-Side Image Upload Helper
 *
 * Uploads card images to Supabase Storage and returns public URLs
 * that can be passed to the /api/bulk/batches/[batchId]/items endpoint.
 *
 * Storage bucket: "bulk-images" (create this bucket in Supabase dashboard)
 * Access: private, with RLS via user_id path prefix
 *
 * TODO: Create the "bulk-images" storage bucket in Supabase with these settings:
 *   - Public: false (private)
 *   - File size limit: 4MB
 *   - Allowed MIME types: image/jpeg, image/png, image/webp
 *   - RLS policy: users can only upload/read from their own user_id folder
 */

import { createClient } from "@/lib/supabase/client";

const STORAGE_BUCKET = "bulk-images";
const MAX_FILE_SIZE_MB = 4;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export type UploadResult =
  | { ok: true; publicUrl: string; storagePath: string }
  | { ok: false; error: string };

/**
 * Upload a single image file to Supabase Storage.
 *
 * Returns the public URL on success, or an error string on failure.
 * Caller is responsible for creating the storage bucket if it doesn't exist.
 */
export async function uploadBulkImage(
  file: File,
  userId: string,
): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_FILE_SIZE_MB}MB.`,
    };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "File must be an image." };
  }

  const supabase = createClient();

  // Path: {userId}/{timestamp}-{random}.{ext}
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const storagePath = `${userId}/${timestamp}-${random}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error("[bulk/upload] Storage upload error:", error.message);
    return { ok: false, error: error.message };
  }

  // Get the public URL (requires the bucket to have public access enabled,
  // OR use createSignedUrl if bucket is private)
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return { ok: true, publicUrl: urlData.publicUrl, storagePath };
}

/**
 * Upload multiple files in parallel (max 5 concurrent uploads).
 * Returns an array of results in the same order as input files.
 */
export async function uploadBulkImages(
  files: File[],
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = new Array(files.length);
  const CONCURRENCY = 5;

  let completed = 0;

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((file) => uploadBulkImage(file, userId))
    );

    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j];
      completed++;
      onProgress?.(completed, files.length);
    }
  }

  return results;
}
