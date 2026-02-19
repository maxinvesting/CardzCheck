# Listings vs Sold Discount Analyzer Test Checklist

## Manual verification

1. Run seed helper for 10 fingerprints
   - `POST /api/admin/market-discount` with body `{"action":"seed"}`.
2. Open admin debug page
   - `/admin/market-discount`.
3. For a known card fingerprint, verify:
   - Active raw median vs trimmed median.
   - Sold raw median vs trimmed median.
   - `discount_ratio` and `discount_ratio_clipped`.
   - Outlier counts for active/sold.
4. Verify bucket aggregation:
   - Bucket contains expected `priceTier`, `liquidityBucket`, and `gradedFlag`.
   - Bucket row has `ratio_median`, `ratio_p25`, `ratio_p75`, and `n_cards` > 0.
5. Verify CMV branch behavior:
   - `sold_count >= 8` returns `method = sold_median`.
   - `sold_count < 8` and `listing_count >= 8` returns `method = listing_adjusted`.
   - Very sparse data returns `method = insufficient_data`.
6. Verify confidence labels:
   - High confidence requires larger sold/listing sample sizes and lower outlier rate.
   - Sparse samples are low confidence.
7. Verify API payloads:
   - `GET /api/search` includes `_marketDiscount` with method, confidence, counts, and expected ratio.
8. Verify security:
   - Non-admin users cannot access `/api/admin/market-discount` (403).
   - Market tables are not directly readable via anon/authenticated clients due to RLS + no policies.

## SQL spot checks

```sql
select snapshot_type, count(*)
from market_price_snapshots
group by 1;

select confidence, count(*)
from market_discount_factors
group by 1;

select bucket, ratio_median, n_cards, confidence
from market_discount_buckets
order by computed_at desc
limit 20;
```
