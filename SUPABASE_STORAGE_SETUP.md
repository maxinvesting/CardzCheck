# Supabase Storage Setup Guide

## Fix "Bucket not found" Error

The "Bucket not found" error occurs because the Supabase storage bucket hasn't been created yet. Follow these steps to set it up:

### Step 1: Create the Storage Bucket

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (CardzCheck)
3. Click **Storage** in the left sidebar
4. Click the **New Bucket** button
5. Configure the bucket:
   - **Name**: `card-images` (must be exactly this name)
   - **Public**: ✅ Enable (required for public URLs)
   - **File size limit**: 10 MB (optional but recommended)
   - **Allowed MIME types**: `image/*` (optional but recommended)
6. Click **Create Bucket**

### Step 2: Configure Bucket Policies (Recommended)

To allow users to upload images while maintaining security:

1. Go to **Storage** → **Policies** for the `card-images` bucket
2. Click **New Policy**
3. Create an **INSERT** policy:
   ```sql
   -- Policy name: Allow authenticated uploads
   -- Operation: INSERT
   -- Target roles: authenticated

   -- Policy definition:
   (bucket_id = 'card-images'::text)
   ```

4. Create a **SELECT** policy for public read access:
   ```sql
   -- Policy name: Allow public read
   -- Operation: SELECT
   -- Target roles: public

   -- Policy definition:
   (bucket_id = 'card-images'::text)
   ```

### Step 3: Verify the Setup

1. Go back to your CardzCheck app
2. Try uploading a card image
3. The "Bucket not found" error should be resolved

### Optional: Configure CORS (if needed)

If you encounter CORS issues:

1. Go to **Storage** → **Configuration**
2. Add your app URL to allowed origins:
   - Development: `http://localhost:3000`
   - Production: Your production URL

## Troubleshooting

### Still seeing "Bucket not found"?

1. Double-check the bucket name is exactly `card-images` (lowercase, hyphenated)
2. Verify your Supabase environment variables in `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```
3. Restart your development server after creating the bucket
4. Clear your browser cache

### Upload fails with permission error?

1. Make sure the bucket is set to **Public**
2. Check that INSERT policy allows authenticated users
3. Verify the user is logged in before uploading

### Images not displaying?

1. Confirm SELECT policy allows public access
2. Check browser console for CORS errors
3. Verify the public URL is correctly generated

## Additional Storage Limits

### Free Tier Limits
- Storage: 1 GB
- File uploads: 50 MB per file
- Bandwidth: 2 GB per month

### Recommendations
- Enable file size limits (10 MB) in bucket settings
- Implement client-side image compression for large files
- Consider cleanup policies for old uploaded images
- Monitor storage usage in Supabase dashboard

## Need Help?

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Storage Security Guide](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Discord](https://discord.supabase.com)
