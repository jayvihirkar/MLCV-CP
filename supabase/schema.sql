-- Run once in the Supabase SQL Editor before enabling the cloud backend.
create table if not exists public.app_records (
  namespace text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (namespace, key)
);
alter table public.app_records enable row level security;
create unique index if not exists app_records_user_email
  on public.app_records (lower(value->>'email')) where namespace = 'users';
revoke all on public.app_records from anon, authenticated;
grant all on public.app_records to service_role;

-- Apply only changed records. Serialize writers and reject stale edits rather
-- than overwriting another request's work. The complete batch is transactional.
create or replace function public.app_apply_changes(p_namespace text, p_changes jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare change jsonb; current_value jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_namespace, 0));
  for change in select * from jsonb_array_elements(p_changes) loop
    select value into current_value from public.app_records
      where namespace = p_namespace and key = change->>'key';
    if coalesce(current_value, 'null'::jsonb) is distinct from change->'expected' then
      raise exception 'Concurrent record update' using errcode = '40001';
    end if;
    if change->'value' = 'null'::jsonb then
      delete from public.app_records where namespace = p_namespace and key = change->>'key';
    else
      insert into public.app_records(namespace, key, value) values(p_namespace, change->>'key', change->'value')
      on conflict(namespace, key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;
end $$;

create or replace function public.app_take_record(p_namespace text, p_key text, p_owner text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  delete from public.app_records where namespace = p_namespace and key = p_key
    and (p_owner is null or value->>'userId' = p_owner) returning value into result;
  return result;
end $$;
revoke all on function public.app_apply_changes(text, jsonb) from public, anon, authenticated;
revoke all on function public.app_take_record(text, text, text) from public, anon, authenticated;
grant execute on function public.app_apply_changes(text, jsonb) to service_role;
grant execute on function public.app_take_record(text, text, text) to service_role;

-- Private; every download is authorized by the Express API first.
insert into storage.buckets(id, name, public, file_size_limit)
values ('meditrace-attachments', 'meditrace-attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Optional periodic maintenance (e.g. a Supabase Cron job):
-- delete from public.app_records where namespace in ('auth-tokens','oauth-states','upload-tickets')
--   and (value->>'expiresAt')::bigint < extract(epoch from now()) * 1000;
-- Remove abandoned objects under staging/ with a scheduled Storage cleanup.
