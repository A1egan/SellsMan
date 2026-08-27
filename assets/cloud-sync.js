(function(root){
  'use strict';
  const core = root.CloudSyncCore;
  if (!core) return;

  const STORE_KEYS = {
    customers: 'sales_followup_data_v3',
    tags: 'sales_tags_v1',
    work_tasks: 'sales_work_tasks_v1'
  };
  const META_KEY = 'sales_cloud_sync_meta_v1';
  const PENDING_KEY = 'sales_cloud_pending_v1';
  const CONFLICT_KEY = 'sales_cloud_conflicts_v1';
  const BASELINE_EXPORTED_AT = '2026-08-27T02:02:10.150Z';

  const state = {
    client: null,
    session: null,
    initialized: false,
    flushing: false,
    suppressObservation: false,
    listeners: new Set(),
    lastSyncedAt: '',
    error: '',
    observerInstalled: false,
    pullTimer: 0
  };

  const nowId = () => `m_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const readJSON = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch (_) { return fallback; }
  };
  const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const readPending = () => { const q=readJSON(PENDING_KEY,[]); return Array.isArray(q)?q:[]; };
  const writePending = q => writeJSON(PENDING_KEY, Array.isArray(q)?q:[]);
  const readConflicts = () => { const q=readJSON(CONFLICT_KEY,[]); return Array.isArray(q)?q:[]; };
  const writeConflicts = q => writeJSON(CONFLICT_KEY, Array.isArray(q)?q:[]);
  const readMeta = () => core.normalizeMeta(readJSON(META_KEY,null), state.session && state.session.user && state.session.user.id || '');
  const writeMeta = meta => writeJSON(META_KEY, meta);

  function getStatus(){
    const pendingCount = readPending().length;
    const conflictCount = readConflicts().length;
    let mode = 'local';
    if (!state.client) mode = 'local';
    else if (!state.session) mode = 'signed_out';
    else if (conflictCount) mode = 'conflict';
    else if (!state.initialized) mode = 'needs_init';
    else if (state.flushing) mode = 'syncing';
    else if (state.error && pendingCount) mode = 'offline';
    else if (state.error) mode = 'error';
    else mode = 'synced';
    return { mode, pendingCount, conflictCount, lastSyncedAt: state.lastSyncedAt, error: state.error,
      email: state.session && state.session.user && state.session.user.email || '' };
  }

  function emit(){
    const status=getStatus();
    state.listeners.forEach(fn=>{ try{fn(status);}catch(_){ } });
    if (typeof document !== 'undefined') renderStatus(status);
  }

  function onStatus(listener){ if(typeof listener==='function'){ state.listeners.add(listener); listener(getStatus()); } return ()=>state.listeners.delete(listener); }

  function markDirty(type,id,op,payload){
    if (!STORE_KEYS[type] || !id) return;
    const meta=readMeta();
    const item={type,id:String(id),op:op==='delete'?'delete':'upsert',payload:payload||null,expectedRevision:core.knownRevision(meta,type,String(id)),mutationId:nowId(),queuedAt:Date.now()};
    writePending(core.enqueuePending(readPending(),item));
    state.error='';
    emit();
    if(state.session && state.initialized) Promise.resolve().then(flushPending);
  }

  function addConflict(item, remote){
    const list=readConflicts().filter(c=>!(c.type===item.type && c.id===item.id));
    const base=core.buildConflict(item.payload,remote||{});
    list.push({...base, conflictId:`${item.type}:${item.id}`, type:item.type, op:item.op, id:item.id, mutationId:item.mutationId});
    writeConflicts(list);
    emit();
  }

  async function flushPending(){
    if(state.flushing || !state.client || !state.session || !state.initialized) return;
    state.flushing=true; state.error=''; emit();
    try{
      while(true){
        const queue=readPending();
        if(!queue.length) break;
        const item=queue[0];
        const fn=item.op==='delete'?'sync_soft_delete_record':'sync_upsert_record';
        const args=item.op==='delete'
          ? {p_record_type:item.type,p_record_id:item.id,p_expected_revision:Number(item.expectedRevision||0)}
          : {p_record_type:item.type,p_record_id:item.id,p_payload:item.payload,p_expected_revision:Number(item.expectedRevision||0)};
        let response;
        try { response=await state.client.rpc(fn,args); }
        catch(err){ state.error=String(err && err.message || err || 'network error'); break; }
        if(!response || response.error){ state.error=String(response && response.error && response.error.message || 'sync failed'); break; }
        const data=response.data||{};
        if(data.status==='conflict'){
          addConflict(item,data.record||null);
          const latest=readPending();
          if(latest[0] && latest[0].mutationId===item.mutationId) writePending(latest.slice(1));
          else writePending(latest.filter(x=>x.mutationId!==item.mutationId));
          continue;
        }
        const record=data.record||{};
        let meta=readMeta();
        meta=core.setKnownRevision(meta,item.type,item.id,Number(record.revision||0));
        writeMeta(meta);
        const latest=readPending();
        const idx=latest.findIndex(x=>x.type===item.type && x.id===item.id);
        if(idx>=0){
          if(latest[idx].mutationId===item.mutationId) latest.splice(idx,1);
          else latest[idx]={...latest[idx],expectedRevision:Number(record.revision||0)};
          writePending(latest);
        }
        state.lastSyncedAt=record.updated_at||new Date().toISOString();
      }
    } finally { state.flushing=false; emit(); }
  }

  function storeRecords(type){ const value=readJSON(STORE_KEYS[type],[]); return Array.isArray(value)?value:[]; }
  function writeStore(type,records){ state.suppressObservation=true; try{writeJSON(STORE_KEYS[type],records);}finally{state.suppressObservation=false;} }

  function applyRemote(type,rows){
    const pending=readPending();
    const conflicts=[];
    const applicable=[];
    let meta=readMeta();
    for(const row of rows||[]){
      const pendingItem=pending.find(x=>x.type===type && x.id===row.id);
      const known=core.knownRevision(meta,type,row.id);
      if(pendingItem && Number(row.revision||0)>known){ conflicts.push([pendingItem,row]); continue; }
      applicable.push(row);
      meta=core.setKnownRevision(meta,type,row.id,Number(row.revision||0));
    }
    const applied=core.applyRemoteRows(storeRecords(type),applicable);
    writeStore(type,applied.records);
    writeMeta(meta);
    conflicts.forEach(([item,row])=>addConflict(item,row));
  }

  async function pull(reason){
    if(!state.client || !state.session || !state.initialized) return;
    state.error=''; emit();
    let meta=readMeta();
    let maxSeen=meta.lastPullAt||'';
    try{
      for(const type of core.TYPES){
        let q=state.client.from(type).select('id,payload,revision,updated_at,deleted_at').order('updated_at',{ascending:true});
        if(meta.lastPullAt) q=q.gte('updated_at',meta.lastPullAt);
        const {data,error}=await q;
        if(error) throw error;
        const rows=Array.isArray(data)?data:[];
        applyRemote(type,rows);
        for(const row of rows){ if(row.updated_at && (!maxSeen || row.updated_at>maxSeen)) maxSeen=row.updated_at; }
      }
      meta=readMeta(); meta.lastPullAt=maxSeen; writeMeta(meta);
      state.lastSyncedAt=maxSeen||new Date().toISOString();
      state.error='';
    }catch(err){ state.error=String(err && err.message || err || 'pull failed'); }
    emit();
  }

  async function manualSync(){ await pull('manual'); await flushPending(); }

  async function login(email){
    if(!state.client) throw new Error('cloud sync not configured');
    const value=String(email||'').trim(); if(!value) throw new Error('email required');
    const redirectTo=(root.location && root.location.origin ? root.location.origin : '') + (root.location && root.location.pathname ? root.location.pathname : '/');
    const {error}=await state.client.auth.signInWithOtp({email:value,options:{emailRedirectTo:redirectTo}});
    if(error) throw error;
  }
  async function logout(){ if(state.client) await state.client.auth.signOut(); state.session=null; state.initialized=false; state.error=''; emit(); }

  async function checkInitialized(){
    if(!state.client || !state.session){ state.initialized=false; return false; }
    const {data,error}=await state.client.from('sync_state').select('owner_id,initialized_at,schema_version').maybeSingle();
    if(error) throw error;
    state.initialized=!!data;
    return state.initialized;
  }

  function validateBaseline(payload){
    if(!payload || typeof payload!=='object') throw new Error('备份文件格式无效');
    const users=Array.isArray(payload.users)?payload.users:[];
    const tags=Array.isArray(payload.tags)?payload.tags:[];
    const workTasks=Array.isArray(payload.workTasks)?payload.workTasks:[];
    if(Number(payload.version)!==2 && Number(payload.version)!==3) throw new Error('仅支持 version 2/3 备份');
    if(payload.exportedAt!==BASELINE_EXPORTED_AT || users.length!==1060 || tags.length!==10 || workTasks.length!==0) throw new Error('这不是已确认的 2026-08-27 初始化基线');
    const ids=new Set(); for(const u of users){ if(!u || !u.id || ids.has(u.id)) throw new Error('客户 ID 重复或缺失'); ids.add(u.id); }
    return {users,tags,workTasks};
  }

  async function initializeFromBackup(payload){
    if(!state.client || !state.session) throw new Error('请先登录云同步');
    if(await checkInitialized()){ await pull('already-initialized'); return {status:'already_initialized'}; }
    const data=validateBaseline(payload);
    const groups=[['customers',data.users],['tags',data.tags],['work_tasks',data.workTasks]];
    for(const [type,records] of groups){
      for(let i=0;i<records.length;i+=12){
        const chunk=records.slice(i,i+12);
        const results=await Promise.all(chunk.map(record=>state.client.rpc('sync_initialize_record',{p_record_type:type,p_record_id:String(record.id),p_payload:record})));
        for(const res of results){ if(res.error) throw res.error; if(!res.data || (res.data.status!=='ok')) throw new Error(`初始化 ${type} 失败`); }
      }
    }
    const fin=await state.client.rpc('sync_finalize_initialization',{p_schema_version:1});
    if(fin.error) throw fin.error;
    state.initialized=true;
    let meta=readMeta(); meta.initializedSource=BASELINE_EXPORTED_AT; writeMeta(meta);
    await pull('initialized');
    await flushPending();
    emit();
    return {status:'ok',customers:data.users.length,tags:data.tags.length,workTasks:data.workTasks.length};
  }

  async function resolveConflict(conflictId,choice){
    const list=readConflicts(); const c=list.find(x=>x.conflictId===conflictId); if(!c) return;
    if(choice==='remote'){
      const row={id:c.id,payload:c.remote,revision:c.remoteRevision,deleted_at:c.remoteDeletedAt};
      applyRemote(c.type,[row]);
      writeConflicts(readConflicts().filter(x=>x.conflictId!==conflictId));
      writePending(readPending().filter(x=>!(x.type===c.type && x.id===c.id)));
      emit(); return;
    }
    if(choice==='local'){
      const {data,error}=await state.client.from(c.type).select('id,payload,revision,updated_at,deleted_at').eq('id',c.id).maybeSingle();
      if(error) throw error;
      const expected=Number(data && data.revision || 0);
      const fn=c.op==='delete'?'sync_soft_delete_record':'sync_upsert_record';
      const args=c.op==='delete'?{p_record_type:c.type,p_record_id:c.id,p_expected_revision:expected}:{p_record_type:c.type,p_record_id:c.id,p_payload:c.local,p_expected_revision:expected};
      const res=await state.client.rpc(fn,args); if(res.error) throw res.error;
      if(!res.data || res.data.status!=='ok'){ addConflict({...c,expectedRevision:expected,mutationId:nowId()},res.data&&res.data.record); return; }
      let meta=readMeta(); meta=core.setKnownRevision(meta,c.type,c.id,Number(res.data.record.revision||0)); writeMeta(meta);
      writeConflicts(readConflicts().filter(x=>x.conflictId!==conflictId));
      writePending(readPending().filter(x=>!(x.type===c.type && x.id===c.id)));
      state.lastSyncedAt=res.data.record.updated_at||new Date().toISOString(); emit();
    }
  }

  function queueDiff(type,before,after){
    const a=new Map((Array.isArray(before)?before:[]).filter(x=>x&&x.id).map(x=>[String(x.id),x]));
    const b=new Map((Array.isArray(after)?after:[]).filter(x=>x&&x.id).map(x=>[String(x.id),x]));
    for(const [id,next] of b){ const prev=a.get(id); if(!prev || JSON.stringify(prev)!==JSON.stringify(next)) markDirty(type,id,'upsert',next); }
    for(const [id,prev] of a){ if(!b.has(id)) markDirty(type,id,'delete',prev); }
  }

  function installStorageObserver(){
    if(state.observerInstalled || typeof Storage==='undefined') return;
    const proto=Storage.prototype; if(proto.__cloudSyncSetItem) {state.observerInstalled=true;return;}
    const original=proto.setItem;
    Object.defineProperty(proto,'__cloudSyncSetItem',{value:original,configurable:true});
    proto.setItem=function(key,value){
      const type=Object.keys(STORE_KEYS).find(t=>STORE_KEYS[t]===key);
      const watch=type && typeof localStorage!=='undefined' && this===localStorage && !state.suppressObservation;
      const before=watch?readJSON(key,[]):null;
      const result=original.call(this,key,value);
      if(watch){ let after=[]; try{after=JSON.parse(String(value));}catch(_){after=[];} queueDiff(type,before,after); }
      return result;
    };
    state.observerInstalled=true;
  }

  function debouncePull(){ clearTimeout(state.pullTimer); state.pullTimer=setTimeout(()=>pull('focus'),250); }

  function renderStatus(status){
    const btn=document.getElementById('cloudSyncStatusBtn'); if(!btn) return;
    const text={local:'本地模式',signed_out:'登录云同步',needs_init:'初始化云端',syncing:'同步中…',synced:'已同步',offline:`离线 · ${status.pendingCount} 项待同步`,conflict:`${status.conflictCount} 项冲突`,error:'云同步异常'}[status.mode]||'云同步';
    btn.textContent=status.mode==='synced' && status.lastSyncedAt ? `${text} ${new Date(status.lastSyncedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : text;
    btn.dataset.mode=status.mode;
  }

  function ensureUI(){
    if(typeof document==='undefined' || document.getElementById('cloudSyncStatusBtn')) return;
    const actions=document.querySelector('.workspace-topbar-actions'); if(!actions) return;
    const btn=document.createElement('button'); btn.id='cloudSyncStatusBtn'; btn.className='ws-btn cloud-sync-status'; btn.type='button'; btn.textContent='登录云同步'; actions.insertBefore(btn,actions.firstChild);
    btn.addEventListener('click',()=>{ const s=getStatus(); if(s.mode==='signed_out') openLogin(); else if(s.mode==='needs_init') openInit(); else if(s.mode==='conflict') openConflicts(); else manualSync(); });
    const modal=document.createElement('div'); modal.innerHTML=`<div class="cloud-sync-overlay" id="cloudSyncModal"><div class="cloud-sync-modal"><button class="cloud-sync-close" type="button">×</button><div id="cloudSyncModalBody"></div></div></div>`; document.body.appendChild(modal.firstElementChild);
    document.querySelector('#cloudSyncModal .cloud-sync-close').onclick=()=>document.getElementById('cloudSyncModal').classList.remove('show');
    renderStatus(getStatus());
  }
  function showModal(html){ensureUI(); const m=document.getElementById('cloudSyncModal'); document.getElementById('cloudSyncModalBody').innerHTML=html; m.classList.add('show');}
  function openLogin(){ showModal(`<div class="comic-label">CLOUD SYNC</div><h2>登录云同步</h2><p>输入邮箱，我们会发送 Magic Link。</p><input class="ws-input" id="cloudSyncEmail" type="email" placeholder="name@example.com"><button class="ws-btn primary" id="cloudSyncSend" type="button">发送登录链接</button><div class="cloud-sync-note" id="cloudSyncNote"></div>`); document.getElementById('cloudSyncSend').onclick=async()=>{const n=document.getElementById('cloudSyncNote');try{await login(document.getElementById('cloudSyncEmail').value);n.textContent='登录链接已发送，请到邮箱中打开。';}catch(e){n.textContent=e.message||String(e);}}; }
  function openInit(){ showModal(`<div class="comic-label">FIRST SYNC</div><h2>初始化云端数据</h2><p>只接受已确认的 2026-08-27 备份：1060 位客户 · 10 个标签 · 0 个工作任务。</p><input id="cloudSyncBackupFile" type="file" accept="application/json,.json"><button class="ws-btn primary" id="cloudSyncInit" type="button">使用此备份初始化</button><div class="cloud-sync-note" id="cloudSyncNote"></div>`); document.getElementById('cloudSyncInit').onclick=async()=>{const n=document.getElementById('cloudSyncNote'),f=document.getElementById('cloudSyncBackupFile').files[0];if(!f){n.textContent='请选择备份 JSON';return;}try{const p=JSON.parse(await f.text());n.textContent='正在初始化，请勿关闭页面…';await initializeFromBackup(p);n.textContent='初始化完成';setTimeout(()=>document.getElementById('cloudSyncModal').classList.remove('show'),500);}catch(e){n.textContent=e.message||String(e);}}; }
  function openConflicts(){ const list=readConflicts(); showModal(`<div class="comic-label">CONFLICT</div><h2>${list.length} 项冲突</h2>${list.map(c=>`<section class="cloud-conflict"><strong>${String(c.local&&c.local.number||c.id)}</strong><details><summary>查看差异</summary><pre>当前设备\n${escapeHtml(JSON.stringify(c.local,null,2))}\n\n云端\n${escapeHtml(JSON.stringify(c.remote,null,2))}</pre></details><div><button class="ws-btn" data-remote="${c.conflictId}">保留云端版本</button><button class="ws-btn primary" data-local="${c.conflictId}">保留当前设备版本</button></div></section>`).join('')}`); document.querySelectorAll('[data-remote]').forEach(b=>b.onclick=async()=>{await resolveConflict(b.dataset.remote,'remote');openConflicts();}); document.querySelectorAll('[data-local]').forEach(b=>b.onclick=async()=>{await resolveConflict(b.dataset.local,'local');openConflicts();}); }
  function escapeHtml(v){ return String(v||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  async function init(){
    installStorageObserver(); ensureUI();
    const cfg=root.CLOUD_SYNC_CONFIG;
    if(!cfg || !cfg.url || !cfg.publishableKey || !root.supabase || !root.supabase.createClient){ emit(); return; }
    state.client=root.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const sessionResult=await state.client.auth.getSession(); state.session=sessionResult && sessionResult.data && sessionResult.data.session || null;
    state.client.auth.onAuthStateChange(async(_event,session)=>{state.session=session;state.error='';if(session){let meta=readMeta();if(meta.ownerId!==session.user.id){meta=core.normalizeMeta(null,session.user.id);writeMeta(meta);}try{await checkInitialized();if(state.initialized){await pull('auth');await flushPending();}}catch(e){state.error=e.message||String(e);}}else state.initialized=false;emit();});
    if(state.session){ let meta=readMeta(); if(meta.ownerId!==state.session.user.id){meta=core.normalizeMeta(null,state.session.user.id);writeMeta(meta);} try{await checkInitialized();if(state.initialized){await pull('startup');await flushPending();}}catch(e){state.error=e.message||String(e);} }
    if(typeof addEventListener==='function'){ addEventListener('focus',debouncePull); addEventListener('online',()=>{state.error='';manualSync();}); }
    if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') debouncePull();});
    emit();
  }

  function _setTestState(patch){ Object.assign(state,patch||{}); if(patch && patch.session){let meta=readMeta(); if(meta.ownerId!==patch.session.user.id){meta=core.normalizeMeta(null,patch.session.user.id);writeMeta(meta);}} emit(); }

  root.CloudSync={init,login,logout,markDirty,pull,flushPending,manualSync,getStatus,onStatus,initializeFromBackup,resolveConflict,_setTestState,
    constants:{STORE_KEYS,META_KEY,PENDING_KEY,CONFLICT_KEY,BASELINE_EXPORTED_AT}};
})(typeof globalThis!=='undefined'?globalThis:window);
