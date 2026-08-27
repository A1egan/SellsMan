-- Cloud Sync v1 hardening
-- Keep Data API RPC names stable while moving SECURITY DEFINER implementations
-- out of the exposed public schema.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.sync_upsert_record(text,text,jsonb,bigint) set schema private;
alter function public.sync_soft_delete_record(text,text,bigint) set schema private;
alter function public.sync_initialize_record(text,text,jsonb) set schema private;
alter function public.sync_finalize_initialization(integer) set schema private;

revoke all on function private.sync_upsert_record(text,text,jsonb,bigint) from public, anon;
revoke all on function private.sync_soft_delete_record(text,text,bigint) from public, anon;
revoke all on function private.sync_initialize_record(text,text,jsonb) from public, anon;
revoke all on function private.sync_finalize_initialization(integer) from public, anon;
grant execute on function private.sync_upsert_record(text,text,jsonb,bigint) to authenticated;
grant execute on function private.sync_soft_delete_record(text,text,bigint) to authenticated;
grant execute on function private.sync_initialize_record(text,text,jsonb) to authenticated;
grant execute on function private.sync_finalize_initialization(integer) to authenticated;

create function public.sync_upsert_record(p_record_type text,p_record_id text,p_payload jsonb,p_expected_revision bigint)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$ select private.sync_upsert_record($1,$2,$3,$4) $$;

create function public.sync_soft_delete_record(p_record_type text,p_record_id text,p_expected_revision bigint)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$ select private.sync_soft_delete_record($1,$2,$3) $$;

create function public.sync_initialize_record(p_record_type text,p_record_id text,p_payload jsonb)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$ select private.sync_initialize_record($1,$2,$3) $$;

create function public.sync_finalize_initialization(p_schema_version integer default 1)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$ select private.sync_finalize_initialization($1) $$;

revoke all on function public.sync_upsert_record(text,text,jsonb,bigint) from public, anon;
revoke all on function public.sync_soft_delete_record(text,text,bigint) from public, anon;
revoke all on function public.sync_initialize_record(text,text,jsonb) from public, anon;
revoke all on function public.sync_finalize_initialization(integer) from public, anon;
grant execute on function public.sync_upsert_record(text,text,jsonb,bigint) to authenticated;
grant execute on function public.sync_soft_delete_record(text,text,bigint) to authenticated;
grant execute on function public.sync_initialize_record(text,text,jsonb) to authenticated;
grant execute on function public.sync_finalize_initialization(integer) to authenticated;

notify pgrst, 'reload schema';
