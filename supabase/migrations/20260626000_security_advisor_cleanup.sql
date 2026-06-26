-- Security Advisor cleanup (2026-06-26)
--
-- Clears two classes of Supabase security-advisor WARNs without changing app behavior:
--
-- 1) extension_in_public (pg_trgm): move the extension out of the public schema into the
--    dedicated `extensions` schema. search_cards() already declares
--    `search_path = public, extensions, pg_catalog` and uses similarity()/`%`, so it (and the
--    existing GIN index cards_search_text_trgm_idx, which references the opclass by OID) keep
--    working unchanged.
--
-- 2) anon/authenticated_security_definer_function_executable: the SECURITY DEFINER *helper*
--    functions used by RLS policies (current_user_is_admin, current_business_account_id,
--    is_business_member, has_business_role) are flagged only because they are reachable via
--    PostgREST `/rest/v1/rpc/...`. Moving them into a non-exposed `private` schema removes that
--    REST surface. RLS policies reference them by OID (verified: no other function/view body
--    references them by name; no app code calls them via .rpc()), so policies keep resolving;
--    their EXECUTE grants are preserved across SET SCHEMA. We grant USAGE on `private` to
--    anon/authenticated/service_role so the functions remain callable during RLS evaluation.
--
-- NOT moved: increment_bulk_batch_item_count — the app calls it via .rpc()
-- (app/api/bulk/batches/[batchId]/items/route.ts) and so must stay in the exposed public
-- schema. It is safe: its body is scoped `where ... user_id = auth.uid()`.

-- 1. pg_trgm -> extensions
alter extension pg_trgm set schema extensions;

-- 2. RLS helper functions -> private (non-exposed) schema
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

alter function public.current_user_is_admin() set schema private;
alter function public.current_business_account_id(uuid) set schema private;
alter function public.is_business_member(uuid, uuid) set schema private;
alter function public.has_business_role(uuid, uuid, text[]) set schema private;

-- Refresh PostgREST schema cache so the rpc endpoints disappear immediately.
notify pgrst, 'reload schema';
