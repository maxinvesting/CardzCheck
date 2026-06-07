-- ============================================================================
-- Pre-launch security hardening
-- ============================================================================
-- Addresses findings from a full security audit (2026-06-07):
--   1. CRITICAL privilege/payment escalation via public.users self-update
--   2. CRITICAL self-grant of paid grade-scan credits (permissive RLS)
--   3. CRITICAL exposed tables with RLS disabled (webhook_events, psa_cert_cache)
--   4. HIGH  anon-callable SECURITY DEFINER RPCs taking arbitrary user_id
--   5. HIGH  anon-writable site-wide announcements (permissive RLS)
--   6. Hardening: pin search_path on SECURITY DEFINER functions
--
-- All changes were verified against application code:
--   - is_paid/stripe_customer_id/app_role are only escalated via the SERVICE
--     client (Stripe webhook + owner-gated admin/roles route); user-context
--     routes only ever set is_paid := false, so escalation is blocked while
--     legitimate downgrade/profile flows keep working.
--   - The four locked-down RPCs are invoked only through createServiceClient()
--     (lib/grading/scanCredits.ts, lib/grading/tokenBudget.ts), except
--     increment_bulk_batch_item_count which the user client calls (anon-only revoke).
--   - webhook_events / psa_cert_cache are accessed only via createServiceClient(),
--     which bypasses RLS, so enabling RLS does not break them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRITICAL: block privilege & payment escalation on public.users
--    The "Users can update own ..." RLS policies scope writes by row
--    (auth.uid() = id) but NOT by column, and `authenticated` holds table-wide
--    UPDATE. The existing guard only protected the legacy `role` column; admin
--    access is actually keyed off `app_role`, and `is_paid`/`stripe_customer_id`
--    were unprotected. Extend the guard to mirror the role protection.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_role_and_wallet_updates()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.wallet_address IS NOT NULL THEN
    NEW.wallet_address := lower(trim(NEW.wallet_address));
  END IF;

  -- Service role (Stripe webhook, owner-gated admin route) may set anything.
  IF auth.role() <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      -- Legacy role column
      NEW.role := COALESCE(NEW.role, 'user');
      IF NEW.role <> 'user' THEN
        RAISE EXCEPTION 'Only service role can assign role';
      END IF;
      -- Admin role column (defaults to 'member')
      IF COALESCE(NEW.app_role, 'member') <> 'member' THEN
        RAISE EXCEPTION 'Only service role can assign app_role';
      END IF;
      -- Cannot self-provision a paid account
      IF COALESCE(NEW.is_paid, false) IS TRUE THEN
        RAISE EXCEPTION 'Only service role can set is_paid';
      END IF;
      -- Stripe customer id is owned by billing webhooks
      IF NEW.stripe_customer_id IS NOT NULL THEN
        RAISE EXCEPTION 'Only service role can set stripe_customer_id';
      END IF;
    ELSE  -- UPDATE
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Only service role can change role';
      END IF;
      IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
        RAISE EXCEPTION 'Only service role can change app_role';
      END IF;
      -- Downgrades (-> false) are fine; block self-escalation to paid.
      IF COALESCE(NEW.is_paid, false) IS TRUE
         AND COALESCE(OLD.is_paid, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Only service role can grant is_paid';
      END IF;
      IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
        RAISE EXCEPTION 'Only service role can change stripe_customer_id';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. CRITICAL + HIGH: remove permissive "ALL USING(true)" policies.
--    These were intended for the service role (which already bypasses RLS), but
--    were bound to {public}, so any anon/authenticated user could write them.
--      - grade_scan_credits: users could self-grant unlimited paid AI credits
--      - announcements:       users could post/delete site-wide announcements
--    The SELECT policies (read own / read public) remain; service-client writes
--    keep working because service_role bypasses RLS entirely.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS grade_scan_credits_service_all ON public.grade_scan_credits;
DROP POLICY IF EXISTS announcements_service_all ON public.announcements;

-- ----------------------------------------------------------------------------
-- 3. CRITICAL: enable RLS on tables exposed to PostgREST.
--    Both are written/read only through the service client, so enabling RLS
--    with no policy (deny-all for anon/authenticated) closes public access
--    without breaking the app.
-- ----------------------------------------------------------------------------
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psa_cert_cache ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. HIGH: stop anon/authenticated from calling sensitive SECURITY DEFINER RPCs
--    directly via /rest/v1/rpc. They take an arbitrary p_user_id and run as the
--    definer, so exposure let anyone mint/drain another user's credits or token
--    budget. All are invoked server-side through the service client.
-- ----------------------------------------------------------------------------
-- NOTE: EXECUTE is granted to PUBLIC at function creation and anon/authenticated
-- inherit it, so we must revoke from PUBLIC and grant back only to the roles that
-- actually call each function (otherwise the revoke is a no-op).
REVOKE EXECUTE ON FUNCTION public.apply_weekly_grade_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_weekly_grade_credit(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_grade_scan_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_grade_scan_credit(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_grade_token_usage(uuid, date, bigint, bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_grade_token_usage(uuid, date, bigint, bigint, integer) TO service_role;

-- Bulk counter is called by the user (authenticated) client, so keep
-- `authenticated` but remove unauthenticated/PUBLIC access.
REVOKE EXECUTE ON FUNCTION public.increment_bulk_batch_item_count(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.increment_bulk_batch_item_count(uuid, integer) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Hardening: pin search_path on SECURITY DEFINER functions to prevent
--    search_path hijacking. Non-breaking (does not alter behavior).
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.apply_weekly_grade_credit(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.consume_grade_scan_credit(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.increment_grade_token_usage(uuid, date, bigint, bigint, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.increment_bulk_batch_item_count(uuid, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.current_business_account_id(uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.current_user_is_admin() SET search_path = pg_catalog, public;
ALTER FUNCTION public.has_business_role(uuid, uuid, text[]) SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_business_member(uuid, uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sync_business_account_id_from_owner() SET search_path = pg_catalog, public;
