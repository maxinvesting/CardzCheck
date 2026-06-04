-- Migration: create the card-images storage bucket
-- Date: 2026-06-03
--
-- The app uploads user card photos to the `card-images` bucket from several
-- places (AddCardToInventoryModal, DualCardUploader, CardUploader,
-- AddCardModalNew, grade scan). The bucket was never created, so every upload
-- failed — most callers silently fell back to inline base64 data URLs, while
-- the inventory add modal surfaced the error. This creates the bucket and the
-- RLS policies so uploads persist to storage.

-- Public bucket so getPublicUrl() links resolve without signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-images',
  'card-images',
  TRUE,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can read (bucket is public; objects are namespaced by user id).
DROP POLICY IF EXISTS "card-images public read" ON storage.objects;
CREATE POLICY "card-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-images');

-- Authenticated users may upload only under their own "<uid>/..." prefix.
DROP POLICY IF EXISTS "card-images owner insert" ON storage.objects;
CREATE POLICY "card-images owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may update/replace their own objects.
DROP POLICY IF EXISTS "card-images owner update" ON storage.objects;
CREATE POLICY "card-images owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may delete their own objects.
DROP POLICY IF EXISTS "card-images owner delete" ON storage.objects;
CREATE POLICY "card-images owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'card-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
