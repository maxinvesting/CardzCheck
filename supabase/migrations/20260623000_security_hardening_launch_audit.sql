-- Pre-launch security hardening (2026-06-23 audit)
--
-- H2: Revoke direct EXECUTE on trigger-only SECURITY DEFINER functions.
--   These run from triggers (which fire as the table owner regardless of role
--   grants), so no client ever needs to call them via the PostgREST /rpc/
--   endpoint. Leaving them executable by anon/authenticated lets a caller invoke
--   privileged, RLS-bypassing logic directly.
--
--   NOTE: the SECURITY DEFINER *helper* functions flagged by the linter
--   (is_business_member, has_business_role, current_user_is_admin,
--   current_business_account_id) are intentionally LEFT executable — they are
--   referenced inside RLS policies (including public-facing ones), and revoking
--   EXECUTE would cause "permission denied for function" during RLS evaluation.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.guard_user_role_and_wallet_updates() from anon, authenticated, public;
revoke execute on function public.sync_business_account_id_from_owner() from anon, authenticated, public;

-- M1: Drop the broad public SELECT policies on storage.objects. A public bucket
--   serves objects through its CDN URL (getPublicUrl) without any SELECT policy;
--   the broad policy only adds the ability to LIST/enumerate every file in the
--   bucket. Owner-scoped SELECT policies remain for authenticated REST reads, and
--   public image display (resolver.ts / card image URLs) continues to work via
--   the public object URL.
drop policy if exists "card-images public read" on storage.objects;
drop policy if exists "Shop images read public" on storage.objects;
