# Collection Schema Verification

Run these checks in Supabase SQL Editor to confirm `collection_items` contract and insert permissions:

```sql
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'collection_items'
  and column_name in (
    'user_id',
    'player_name',
    'year',
    'set_name',
    'grade',
    'purchase_price',
    'purchase_date',
    'image_url',
    'notes',
    'parallel_type',
    'card_number',
    'est_cmv',
    'estimated_cmv',
    'cmv_confidence',
    'cmv_last_updated'
  )
order by column_name;
```

```sql
select
  policyname,
  cmd,
  roles,
  permissive,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'collection_items'
order by policyname;
```

Expected insert policy: `"Users can create own collection items"` with `with_check` equivalent to `auth.uid() = user_id`.
