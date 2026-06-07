-- ============================================================================
-- Hardening: pin a stable search_path on every public function we own.
-- ============================================================================
-- Addresses the `function_search_path_mutable` security lint. A function with a
-- role-mutable search_path can be hijacked (a caller's search_path could resolve
-- an unqualified name to a malicious object), which is most dangerous for
-- SECURITY DEFINER functions. We set an explicit path matching Supabase's
-- default resolution order so existing behavior is preserved.
--
-- Extension-owned functions (e.g. pg_trgm's set_limit) are excluded — they are
-- not ours to alter.
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_catalog', r.sig);
  END LOOP;
END $$;
