-- Atomic usage increment functions
--
-- Replaces the read-then-write pattern in lib/access.ts that could lose
-- increments when two requests for the same user ran concurrently (both
-- read the same value, both wrote value+1 instead of value+2).
--
-- Each function uses a single INSERT … ON CONFLICT DO UPDATE so the
-- increment happens in one database round-trip under a row lock.

-- ---------------------------------------------------------------------------
-- increment_search_usage
-- ---------------------------------------------------------------------------
create or replace function increment_search_usage(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into usage (user_id, searches_used, ai_messages_used)
  values (p_user_id, 1, 0)
  on conflict (user_id) do update
    set searches_used = usage.searches_used + 1;
end;
$$;

-- Only the service role (server-side code) should call these functions.
revoke all on function increment_search_usage(uuid) from public;
grant execute on function increment_search_usage(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- increment_ai_usage
-- ---------------------------------------------------------------------------
create or replace function increment_ai_usage(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into usage (user_id, searches_used, ai_messages_used)
  values (p_user_id, 0, 1)
  on conflict (user_id) do update
    set ai_messages_used = usage.ai_messages_used + 1;
end;
$$;

revoke all on function increment_ai_usage(uuid) from public;
grant execute on function increment_ai_usage(uuid) to service_role;
