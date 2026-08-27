-- Cloud Sync v1
-- Tables are owner-readable; all mutations go through revision-aware RPCs.

create table if not exists public.customers (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id)
);
create table if not exists public.tags (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id)
);
create table if not exists public.work_tasks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id)
);
create table if not exists public.sync_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  initialized_at timestamptz not null default now(),
  schema_version integer not null default 1 check (schema_version >= 1),
  last_server_change_at timestamptz
);
create index if not exists customers_owner_updated_idx on public.customers(owner_id,updated_at);
create index if not exists tags_owner_updated_idx on public.tags(owner_id,updated_at);
create index if not exists work_tasks_owner_updated_idx on public.work_tasks(owner_id,updated_at);

alter table public.customers enable row level security;
alter table public.tags enable row level security;
alter table public.work_tasks enable row level security;
alter table public.sync_state enable row level security;

drop policy if exists customers_owner_select on public.customers;
create policy customers_owner_select on public.customers for select to authenticated using (auth.uid()=owner_id);
drop policy if exists tags_owner_select on public.tags;
create policy tags_owner_select on public.tags for select to authenticated using (auth.uid()=owner_id);
drop policy if exists work_tasks_owner_select on public.work_tasks;
create policy work_tasks_owner_select on public.work_tasks for select to authenticated using (auth.uid()=owner_id);
drop policy if exists sync_state_owner_select on public.sync_state;
create policy sync_state_owner_select on public.sync_state for select to authenticated using (auth.uid()=owner_id);

create or replace function public.sync_upsert_record(p_record_type text,p_record_id text,p_payload jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid:=auth.uid(); v_result jsonb; v_remote jsonb;
begin
  if v_owner is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_record_id is null or btrim(p_record_id)='' or p_payload is null or p_expected_revision<0 then raise exception 'invalid sync arguments' using errcode='22023'; end if;
  if p_record_type='customers' then
    if p_expected_revision=0 then
      insert into public.customers(owner_id,id,payload,revision,updated_at,deleted_at) values(v_owner,p_record_id,p_payload,1,now(),null)
      on conflict(owner_id,id) do nothing
      returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    else
      update public.customers set payload=p_payload,revision=revision+1,updated_at=now(),deleted_at=null
      where owner_id=v_owner and id=p_record_id and revision=p_expected_revision
      returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    end if;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_remote from public.customers where owner_id=v_owner and id=p_record_id; return jsonb_build_object('status','conflict','record',v_remote); end if;
  elsif p_record_type='tags' then
    if p_expected_revision=0 then
      insert into public.tags(owner_id,id,payload,revision,updated_at,deleted_at) values(v_owner,p_record_id,p_payload,1,now(),null)
      on conflict(owner_id,id) do nothing
      returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    else
      update public.tags set payload=p_payload,revision=revision+1,updated_at=now(),deleted_at=null
      where owner_id=v_owner and id=p_record_id and revision=p_expected_revision
      returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    end if;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_remote from public.tags where owner_id=v_owner and id=p_record_id; return jsonb_build_object('status','conflict','record',v_remote); end if;
  elsif p_record_type='work_tasks' then
    if p_expected_revision=0 then
      insert into public.work_tasks(owner_id,id,payload,revision,updated_at,deleted_at) values(v_owner,p_record_id,p_payload,1,now(),null)
      on conflict(owner_id,id) do nothing
      returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    else
      update public.work_tasks set payload=p_payload,revision=revision+1,updated_at=now(),deleted_at=null
      where owner_id=v_owner and id=p_record_id and revision=p_expected_revision
      returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    end if;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_remote from public.work_tasks where owner_id=v_owner and id=p_record_id; return jsonb_build_object('status','conflict','record',v_remote); end if;
  else raise exception 'unsupported record type: %',p_record_type using errcode='22023'; end if;
  update public.sync_state set last_server_change_at=now() where owner_id=v_owner;
  return jsonb_build_object('status','ok','record',v_result);
end $$;

create or replace function public.sync_soft_delete_record(p_record_type text,p_record_id text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid:=auth.uid(); v_result jsonb; v_remote jsonb;
begin
  if v_owner is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_record_id is null or btrim(p_record_id)='' or p_expected_revision<1 then raise exception 'invalid delete arguments' using errcode='22023'; end if;
  if p_record_type='customers' then
    update public.customers set revision=revision+1,updated_at=now(),deleted_at=now() where owner_id=v_owner and id=p_record_id and revision=p_expected_revision
    returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_remote from public.customers where owner_id=v_owner and id=p_record_id; return jsonb_build_object('status','conflict','record',v_remote); end if;
  elsif p_record_type='tags' then
    update public.tags set revision=revision+1,updated_at=now(),deleted_at=now() where owner_id=v_owner and id=p_record_id and revision=p_expected_revision
    returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_remote from public.tags where owner_id=v_owner and id=p_record_id; return jsonb_build_object('status','conflict','record',v_remote); end if;
  elsif p_record_type='work_tasks' then
    update public.work_tasks set revision=revision+1,updated_at=now(),deleted_at=now() where owner_id=v_owner and id=p_record_id and revision=p_expected_revision
    returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_remote from public.work_tasks where owner_id=v_owner and id=p_record_id; return jsonb_build_object('status','conflict','record',v_remote); end if;
  else raise exception 'unsupported record type: %',p_record_type using errcode='22023'; end if;
  update public.sync_state set last_server_change_at=now() where owner_id=v_owner;
  return jsonb_build_object('status','ok','record',v_result);
end $$;

create or replace function public.sync_initialize_record(p_record_type text,p_record_id text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid:=auth.uid(); v_result jsonb; v_existing jsonb;
begin
  if v_owner is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_record_id is null or btrim(p_record_id)='' or p_payload is null then raise exception 'invalid initialization arguments' using errcode='22023'; end if;
  if exists(select 1 from public.sync_state where owner_id=v_owner) then return jsonb_build_object('status','blocked','reason','workspace_initialized'); end if;
  if p_record_type='customers' then
    insert into public.customers(owner_id,id,payload,revision,updated_at,deleted_at) values(v_owner,p_record_id,p_payload,1,now(),null) on conflict(owner_id,id) do nothing
    returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_existing from public.customers where owner_id=v_owner and id=p_record_id; if v_existing->'payload' <> p_payload then return jsonb_build_object('status','conflict','record',v_existing); end if; v_result:=v_existing; end if;
  elsif p_record_type='tags' then
    insert into public.tags(owner_id,id,payload,revision,updated_at,deleted_at) values(v_owner,p_record_id,p_payload,1,now(),null) on conflict(owner_id,id) do nothing
    returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_existing from public.tags where owner_id=v_owner and id=p_record_id; if v_existing->'payload' <> p_payload then return jsonb_build_object('status','conflict','record',v_existing); end if; v_result:=v_existing; end if;
  elsif p_record_type='work_tasks' then
    insert into public.work_tasks(owner_id,id,payload,revision,updated_at,deleted_at) values(v_owner,p_record_id,p_payload,1,now(),null) on conflict(owner_id,id) do nothing
    returning jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_result;
    if v_result is null then select jsonb_build_object('id',id,'payload',payload,'revision',revision,'updated_at',updated_at,'deleted_at',deleted_at) into v_existing from public.work_tasks where owner_id=v_owner and id=p_record_id; if v_existing->'payload' <> p_payload then return jsonb_build_object('status','conflict','record',v_existing); end if; v_result:=v_existing; end if;
  else raise exception 'unsupported record type: %',p_record_type using errcode='22023'; end if;
  return jsonb_build_object('status','ok','record',v_result);
end $$;

create or replace function public.sync_finalize_initialization(p_schema_version integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid:=auth.uid(); v_row public.sync_state;
begin
  if v_owner is null then raise exception 'authentication required' using errcode='28000'; end if;
  insert into public.sync_state(owner_id,initialized_at,schema_version,last_server_change_at) values(v_owner,now(),greatest(coalesce(p_schema_version,1),1),now()) on conflict(owner_id) do nothing;
  select * into v_row from public.sync_state where owner_id=v_owner;
  return jsonb_build_object('status','ok','initialized_at',v_row.initialized_at,'schema_version',v_row.schema_version);
end $$;

revoke all on function public.sync_upsert_record(text,text,jsonb,bigint) from public,anon;
revoke all on function public.sync_soft_delete_record(text,text,bigint) from public,anon;
revoke all on function public.sync_initialize_record(text,text,jsonb) from public,anon;
revoke all on function public.sync_finalize_initialization(integer) from public,anon;
grant execute on function public.sync_upsert_record(text,text,jsonb,bigint) to authenticated;
grant execute on function public.sync_soft_delete_record(text,text,bigint) to authenticated;
grant execute on function public.sync_initialize_record(text,text,jsonb) to authenticated;
grant execute on function public.sync_finalize_initialization(integer) to authenticated;
revoke insert,update,delete on public.customers,public.tags,public.work_tasks,public.sync_state from authenticated,anon;
grant select on public.customers,public.tags,public.work_tasks,public.sync_state to authenticated;
