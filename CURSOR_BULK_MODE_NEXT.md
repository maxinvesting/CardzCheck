# Bulk Mode — Cursor Implementation Prompt

You are working in the CardzCheck Next.js + Supabase app. Bulk Mode (`/bulk`) is already
implemented. The following three features need to be built. Read the existing code carefully
before touching anything. Do not break existing flows.

---

## Feature 1: Background Processing (replace synchronous pipeline)

### Problem
`POST /api/bulk/batches/[batchId]/process` currently runs all AI identification calls
synchronously in the request handler. This times out on Vercel for batches > ~10 cards
because each card takes 2–5 seconds.

### What to build

Replace the synchronous approach with a Supabase Edge Function + pg_notify queue pattern.

**Step 1 — Create a `bulk_processing_queue` table:**
```sql
create table bulk_processing_queue (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references bulk_batches(id) on delete cascade,
  item_id     uuid not null references bulk_batch_items(id) on delete cascade,
  status      text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on bulk_processing_queue(batch_id, status);
```

**Step 2 — On POST /api/bulk/batches/[batchId]/process:**
- Instead of calling `processBatch()` inline, insert one row per pending item into
  `bulk_processing_queue` with status='queued'
- Update batch status to 'processing'
- Return 202 Accepted immediately with `{ queued: N }`

**Step 3 — Create a Supabase Edge Function `process-bulk-queue`:**
- File: `supabase/functions/process-bulk-queue/index.ts`
- Uses Deno + `@supabase/supabase-js` with service role key
- Polls `bulk_processing_queue` for status='queued', limit 5 at a time
- For each item: runs the full pipeline (`identifyCard` → `estimateBulkPrice` → `computeShippingAndMargin` → `recommendStrategy` → `buildListingDraft`)
- Updates item status as it goes; marks queue row done/failed
- After all items in a batch are done/failed, updates `bulk_batches.status` = 'ready'
- Deploy with: `supabase functions deploy process-bulk-queue`

**Step 4 — Wire a cron trigger:**
- In Supabase dashboard → Edge Function → process-bulk-queue → add cron: `*/30 * * * * *` (every 30 seconds)
- Or use pg_cron extension: `select cron.schedule('process-bulk-queue', '*/30 * * * *', 'select net.http_post(...)');`

**Step 5 — The UI already polls** (`POLL_INTERVAL_MS = 5000` in `app/bulk/[batchId]/page.tsx`)
so no UI changes needed — it will automatically pick up the status transitions.

### Key files to read first
- `lib/bulk/pipeline.ts` — the `processItem()` and `processBatch()` functions
- `app/api/bulk/batches/[batchId]/process/route.ts` — current sync handler
- `lib/supabase/server.ts` — how to create a service client

---

## Feature 2: Bundle Grouping UI

### Problem
Cards flagged as `recommended_strategy = 'bundle_candidate'` currently have no way to be
grouped together into a lot listing. Users see the flag but can't act on it.

### What to build

**A "Bundles" tab/section on the batch review page** (`app/bulk/[batchId]/page.tsx`) that:

1. Groups bundle_candidate items by shared attributes (same player OR same set)
2. Displays each group as a collapsible card showing:
   - Thumbnails of all cards in the group (up to 6)
   - Total suggested lot price (sum of individual prices × 0.7 for bundle discount)
   - Estimated net profit for the whole lot
3. Allows the user to "Create Bundle" which:
   - Marks all items in the group as `approved`
   - Creates a single `bulk_listing_draft` with `strategy = 'bundle_candidate'`
     and `quantity = N` (where N = number of cards in the lot)
   - Sets `listing_payload_json.title` to something like "Lot of 4 {Player} Cards"
   - Sets `listing_payload_json.photos` to all image URLs from the group (max 12)

**New API endpoint: `POST /api/bulk/batches/[batchId]/bundles`**
- Body: `{ itemIds: string[], lotTitle?: string }`
- Validates all items are in the batch and are bundle_candidates
- Creates a single draft for the lot
- Marks all items as approved

**Grouping logic (client-side, no new API):**
```typescript
// In the batch review page, derive bundle groups from items array:
function groupBundleCandidates(items: BulkItemView[]): BundleGroup[] {
  const candidates = items.filter(v => v.strategy?.recommended_strategy === 'bundle_candidate');
  // Group by player first, then by set_name as fallback
  const grouped = new Map<string, BulkItemView[]>();
  for (const item of candidates) {
    const key = item.identification?.player
      ?? item.identification?.set_name
      ?? 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  return Array.from(grouped.entries())
    .filter(([, items]) => items.length >= 2)  // only groups with 2+ cards
    .map(([key, items]) => ({ key, items }));
}
```

### Key files to read first
- `app/bulk/[batchId]/page.tsx` — the main review page (add bundle UI here)
- `types/bulk.ts` — `BulkListingPayload` shape for the draft
- `app/api/bulk/batches/[batchId]/items/[itemId]/route.ts` — item status update pattern

---

## Feature 3: eBay Listing Push

### Problem
Approved bulk drafts are stored in `bulk_listing_drafts` but have no way to be submitted
to eBay. Users must manually copy data to eBay Seller Hub.

### What to build

**New API endpoint: `POST /api/bulk/batches/[batchId]/items/[itemId]/push-to-ebay`**

This should only be built if eBay Trading API or Inventory API credentials are already
configured in the app. Check for `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_TOKEN` env vars.

**If credentials exist:**
- Read the draft's `listing_payload_json`
- Map it to the eBay Inventory API `createOrReplaceInventoryItem` format
- POST to `https://api.ebay.com/sell/inventory/v1/inventory_item/{sku}`
- Then call `createOffer` and `publishOffer`
- On success: update `bulk_listing_drafts.draft_status = 'exported'` and store the eBay listing ID

**eBay Inventory API mapping:**
```typescript
// Map BulkListingPayload → eBay Inventory Item
const sku = `bulk-${itemId}`;
const inventoryItem = {
  condition: conditionToEbayCode(payload.condition),  // e.g. "LIKE_NEW" → 3000
  product: {
    title: payload.title,
    aspects: Object.entries(payload.item_specifics).map(([k, v]) => ({ name: k, value: [v] })),
    imageUrls: payload.photos,
  },
  availability: {
    shipToLocationAvailability: { quantity: payload.quantity },
  },
};
```

**eBay condition codes for cards:**
- "Like New" / "Near Mint" → 3000 (Very Good)
- "Very Good" → 3000
- "Good" → 5000 (Good)
- "Acceptable" → 7000 (Acceptable)

**UI change in `app/bulk/[batchId]/page.tsx`:**
- Add a "Push to eBay" button next to each approved item's actions
- Only show if `NEXT_PUBLIC_EBAY_PUSH_ENABLED=true` env var is set
- Show loading/success/error state per row

**If credentials don't exist:**
- Skip this feature entirely
- Instead, in the CSV export (already built), include all fields needed to paste
  into eBay's bulk listing tool (File Exchange format)
- Check: `https://developer.ebay.com/devzone/file-exchange/docs/FlatFileVariationInventoryLoadFormat.html`

### Key files to read first
- `lib/ebay/` directory — understand existing eBay client patterns
- `app/api/bulk/batches/[batchId]/items/[itemId]/route.ts` — item update pattern
- `types/bulk.ts` — `BulkListingPayload` shape

---

## Architecture notes to know before starting

- **Auth**: All API routes use `await createClient()` from `@/lib/supabase/server`, then `supabase.auth.getUser()`
- **RLS**: All bulk tables have RLS. Service role bypasses it — use `createServiceClient()` from `@/lib/supabase/server` only in Edge Functions or trusted server code
- **Existing patterns**: Follow the pattern in `app/api/bulk/batches/[batchId]/process/route.ts` for new API routes
- **Types**: Add any new types to `types/bulk.ts`
- **Business rules**: All constants live in `lib/bulk/config.ts` — do not hardcode thresholds anywhere else
- **Do not break**: existing `/collection`, `/comps`, `/grade-probability` flows — Bulk Mode is a standalone workflow

## Env vars you'll need

```
ANTHROPIC_API_KEY          # Already used by card identification
SUPABASE_SERVICE_ROLE_KEY  # Needed for Edge Function
EBAY_APP_ID                # Only for Feature 3
EBAY_CERT_ID               # Only for Feature 3
EBAY_TOKEN                 # Only for Feature 3
NEXT_PUBLIC_EBAY_PUSH_ENABLED=true  # Feature flag for eBay push UI
```
