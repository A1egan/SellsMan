-- Cloud Sync v1 hardening: an authenticated owner cannot mark the workspace
-- initialized until the exact approved baseline has reached the database.

create or replace function public.sync_finalize_initialization(
  p_schema_version integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_customer_count bigint;
  v_tag_count bigint;
  v_task_count bigint;
  v_row public.sync_state;
begin
  if v_owner is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select count(*) into v_customer_count
  from public.customers
  where owner_id = v_owner;

  select count(*) into v_tag_count
  from public.tags
  where owner_id = v_owner;

  select count(*) into v_task_count
  from public.work_tasks
  where owner_id = v_owner;

  if v_customer_count <> 1060 or v_tag_count <> 10 or v_task_count <> 0 then
    raise exception 'initialization incomplete: customers=%, tags=%, work_tasks=%',
      v_customer_count, v_tag_count, v_task_count
      using errcode = '23514';
  end if;

  insert into public.sync_state(owner_id, initialized_at, schema_version, last_server_change_at)
  values(v_owner, now(), greatest(coalesce(p_schema_version, 1), 1), now())
  on conflict(owner_id) do nothing;

  select * into v_row
  from public.sync_state
  where owner_id = v_owner;

  return jsonb_build_object(
    'status', 'ok',
    'initialized_at', v_row.initialized_at,
    'schema_version', v_row.schema_version
  );
end;
$$;

revoke all on function public.sync_finalize_initialization(integer) from public, anon;
grant execute on function public.sync_finalize_initialization(integer) to authenticated;
