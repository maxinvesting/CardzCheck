# Card Profile Feature - Implementation Summary

## Overview
Implemented a comprehensive Card Profile detail view with multi-image support, editable card fields, and safe numeric formatting to eliminate NaN displays.

## Features Implemented

### 1. Multi-Image Support per Card
- **Database**: New `card_images` table with position-based ordering
- **Storage**: Supabase Storage bucket `card-images` with user-namespaced paths
- **Primary Image**: Position 0 is the primary image shown in collection grid
- **Image Operations**:
  - Upload multiple images (multi-select)
  - Delete individual images
  - Reorder images (Set as primary + Move left/right buttons)
  - View all images in carousel/gallery

### 2. Card Profile Page (`/cards/[id]`)
- **Layout**: Two-column responsive grid
  - Left: Image gallery with carousel navigation
  - Right: Editable card details form
- **Navigation**: Click any card in collection grid to view profile
- **Back Button**: Returns to collection view

### 3. Safe Numeric Formatting
- **No more NaN displays**: All formatters return "—" for missing/invalid values
- **Formatters**:
  - `formatCurrency(value)`: Returns "—" or formatted currency
  - `formatPct(value)`: Returns "—" or formatted percentage
  - `computeGainLoss(cmv, purchasePrice)`: Returns null if invalid, preventing NaN calculations
- **Applied to**: Collection grid, dashboard, card profile, all value displays

### 4. Enhanced Card Data Model
- **New Fields**:
  - `grading_company`: PSA, BGS, SGC, CGC, etc.
  - `cert_number`: Certification number from grading company
  - `card_images[]`: Array of related images
  - `primary_image`: Position 0 image for display

## Files Changed

### Database & Migrations
- **`supabase/migrations/20260203_card_images.sql`**: New table with RLS policies

### Types
- **`types/index.ts`**: Added `CardImage` interface and updated `CollectionItem`

### API Routes
- **`app/api/cards/[id]/route.ts`**: GET/PATCH for card details
- **`app/api/cards/[id]/images/route.ts`**: GET/POST/DELETE/PATCH for image operations
- **`app/api/collection/route.ts`**: Updated GET to fetch primary images efficiently

### Pages
- **`app/cards/[id]/page.tsx`**: New card profile page

### Components
- **`components/CardImageGallery.tsx`**: Image carousel with upload/delete/reorder
- **`components/CardDetailsForm.tsx`**: Editable card form with validation
- **`components/CollectionGrid.tsx`**: Updated with safe formatters and clickable tiles

### Utilities
- **`lib/formatters.ts`**: Safe numeric formatting helpers

## Database Schema

```sql
CREATE TABLE card_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  position int NOT NULL DEFAULT 0,
  label text NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_card_images_card_id_position ON card_images(card_id, position);
CREATE INDEX idx_card_images_user_id ON card_images(user_id);
```

### RLS Policies
- SELECT: Users can view own card images
- INSERT: Users can insert images for own cards only
- UPDATE: Users can update own card images
- DELETE: Users can delete own card images

## Storage Configuration
- **Bucket**: `card-images` (should already exist from migration)
- **Path**: `{userId}/{cardId}/{imageId}.{ext}`
- **RLS**: Enforced via existing storage policies

## API Endpoints

### `/api/cards/[id]`
- **GET**: Fetch card with all images
- **PATCH**: Update card details (player, year, set, grade, etc.)

### `/api/cards/[id]/images`
- **GET**: Fetch all images for a card
- **POST**: Upload new images (multipart/form-data)
- **DELETE**: Delete an image (`?imageId=xxx`)
- **PATCH**: Reorder images (body: `{imageOrders: [{id, position}]}`)

## Testing Instructions

### 1. Run the Database Migration
```bash
# Apply the migration
npx supabase db push

# OR if using Supabase CLI in local dev:
supabase migration up
```

### 2. Verify Card Images Table
```sql
-- Check table exists
SELECT * FROM card_images LIMIT 1;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'card_images';
```

### 3. Test Card Profile Flow

#### A. Navigate to Card Profile
1. Go to `/collection`
2. Click any card tile
3. Should navigate to `/cards/[id]`
4. Should show card details + image gallery

#### B. Upload Multiple Images
1. Click "Upload Images" button
2. Select multiple image files (front, back, closeups)
3. Images should appear in gallery immediately
4. First uploaded image becomes position 0 (primary)

#### C. Reorder Images
1. Hover over a thumbnail (not the first one)
2. Click "Set as Primary" - should move to position 0
3. Click "Move Left" - should shift one position left
4. Click "Move Right" - should shift one position right
5. Verify primary image updates in collection grid

#### D. Delete Images
1. Hover over a thumbnail
2. Click red trash icon
3. Confirm deletion
4. Image should be removed from gallery and storage

#### E. Edit Card Details
1. Click "Edit" button on card details panel
2. Update fields (player, year, set, grade, cert #, notes, etc.)
3. Click "Save Changes"
4. Details should update and form should close

#### F. Verify Safe Formatting
1. Check cards with missing purchase_price or CMV
2. Should show "—" instead of "$NaN" or "NaN%"
3. Gain/Loss should only appear when both values exist

### 4. Test Collection Grid Updates

#### A. Primary Image Display
1. Upload images to a card
2. Set one as primary (position 0)
3. Return to collection grid
4. Card tile should show the primary image
5. If no position 0, should show first image
6. If no card_images, should fall back to `image_url`

#### B. Clickable Tiles
1. Click anywhere on a card tile (image or details)
2. Should navigate to card profile page
3. Delete button should still work without navigating

#### C. No NaN Displays
1. Cards with missing data should show "—"
2. No "$NaN" or "NaN%" anywhere in the grid
3. Gain/Loss should only show when calculable

### 5. Test Edge Cases

#### A. Card with No Images
- Profile should show placeholder icon
- Upload button should work
- No errors in console

#### B. Card with One Image
- Should display correctly
- Move left/right buttons should be disabled
- "Set as primary" should work

#### C. Large Image Files
- Files >10MB should be skipped with console warning
- Other valid files should still upload

#### D. Delete Last Image
- Should work without errors
- Gallery should show placeholder

#### E. Navigate Back
- "Back to Collection" button should work
- Browser back button should work
- Card updates should persist

### 6. Verify No Breaking Changes

#### A. Existing Collection Grid
- All cards should still display
- Filtering/sorting should work
- Add card modal should work
- CSV export/import should work

#### B. Dashboard Stats
- Collection value should display correctly
- No NaN in hero stats
- Top performers should work

#### C. Existing Add Card Flow
- CardUploader should still work
- Manual entry should still work
- Card identification should still work

## Performance Considerations

### Efficient Primary Image Fetching
The collection API now fetches all primary images in a single query:
```typescript
const { data: primaryImages } = await supabase
  .from("card_images")
  .select("*")
  .in("card_id", cardIds)
  .eq("position", 0);
```

This prevents N+1 queries when loading the collection grid.

### Image Storage
- Uses Supabase Storage public URLs for fast access
- Images are user-namespaced for security
- Deleting a card cascades to delete all images

## Known Limitations

1. **Drag & Drop Reorder**: Implemented as "Set as primary" + "Move left/right" buttons instead of full drag-and-drop to keep implementation lightweight
2. **Image Compression**: No client-side compression - relies on browser/user to optimize before upload
3. **Bulk Operations**: No bulk upload to multiple cards (intentional - keeps UX simple)

## Troubleshooting

### Images Not Appearing
- Check Supabase Storage bucket exists: `card-images`
- Verify RLS policies on `card_images` table
- Check browser console for 403/404 errors

### NaN Still Showing
- Clear browser cache
- Verify `lib/formatters.ts` is imported correctly
- Check that `computeGainLoss` is being used instead of raw math

### Card Profile 404
- Verify card ID is valid
- Check user owns the card (RLS)
- Ensure `/api/cards/[id]/route.ts` exists

### Upload Failing
- Check file size (<10MB)
- Verify file type is image/*
- Check Supabase Storage quota
- Verify storage policies allow user paths

## Future Enhancements (Not Implemented)

- Full drag-and-drop reorder with drag handles
- Image labels/captions
- Image zoom/lightbox view
- Bulk image upload to multiple cards
- Image cropping/rotation
- Auto-generate thumbnails
- Image compression before upload

## Conclusion

This implementation provides a complete card profile system with multi-image support while maintaining backward compatibility with existing features. All numeric displays now safely handle missing data, and the collection grid seamlessly integrates primary image display with clickable navigation.
