(function(root) {
  'use strict';

  const core = root.CloudSyncCore;
  if (!core) return;

  const STORE_KEYS = {
    customers: 'sales_followup_data_v3',
    tags: 'sales_tags_v1',
    work_tasks: 'sales_work_tasks_v1',
  };
  const META_KEY = 'sales_cloud_sync_meta_v1';
  const PENDING_KEY = 'sales_cloud_pending_v1';
  const CONFLICT_KEY = 'sales_cloud_conflicts_v1';
  const BASELINE_EXPORTED_AT = '2026-08-27T02:02:10.150Z';
  const LEGAL_COLUMNS = new Set(['pending', 'contacting', 'replied', 'lowinterest', 'silent']);

  const state = {
    client: null,
    session: null,
    initialized: false,
    flushing: false,
    flushScheduled: false,
    applyingRemote: false,
    lifecycleInstalled: false,
    lastSyncedAt: '',
    error: '',
    pullTimer: 0,
    statusListeners: new Set(),
    storeListeners: new Set(),
    snapshots: { customers: [], tags: [], work_tasks: [] },
  };

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const mutationId = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function readStore(type) { const value = readJSON(STORE_KEYS[type], []); return Array.isArray(value) ? value : []; }
  function readPending() { const value = readJSON(PENDING_KEY, []); return Array.isArray(value) ? value : []; }
  function writePending(queue) { writeJSON(PENDING_KEY, Array.isArray(queue) ? queue : []); }
  function readConflicts() { const value = readJSON(CONFLICT_KEY, []); return Array.isArray(value) ? value : []; }
  function writeConflicts(items) { writeJSON(CONFLICT_KEY, Array.isArray(items) ? items : []); }
  function currentOwnerId() { return state.session && state.session.user ? String(state.session.user.id || '') : ''; }
  function readMeta() { return core.normalizeMeta(readJSON(META_KEY, null), currentOwnerId()); }
  function writeMeta(meta) { writeJSON(META_KEY, meta); }

  function adoptOwner(ownerId) {
    const id = String(ownerId || '');
    const existing = core.normalizeMeta(readJSON(META_KEY, null), '');
    if (existing.ownerId && existing.ownerId !== id) {
      writeMeta(core.normalizeMeta(null, id));
      writePending([]);
      writeConflicts([]);
      return;
    }
    if (existing.ownerId !== id) writeMeta(core.normalizeMeta(existing, id));
  }

  function snapshotStores() { core.TYPES.forEach(type => { state.snapshots[type] = clone(readStore(type)); }); }

  function getStatus() {
    const pendingCount = readPending().filter(item => !item.ownerId || item.ownerId === currentOwnerId()).length;
    const conflictCount = readConflicts().length;
    let mode = 'local';
    if (state.client && !state.session) mode = 'signed_out';
    else if (state.client && state.session && conflictCount) mode = 'conflict';
    else if (state.client && state.session && !state.initialized) mode = 'needs_init';
    else if (state.client && state.session && state.flushing) mode = 'syncing';
    else if (state.client && state.session && state.error && pendingCount) mode = 'offline';
    else if (state.client && state.session && state.error) mode = 'error';
    else if (state.client && state.session && state.initialized) mode = 'synced';
    return { mode, pendingCount, conflictCount, lastSyncedAt: state.lastSyncedAt, error: state.error,
      email: state.session && state.session.user ? String(state.session.user.email || '') : '' };
  }

  function emitStatus() {
    const status = getStatus();
    state.statusListeners.forEach(listener => { try { listener(status); } catch (_) {} });
  }

  function onStatus(listener) {
    if (typeof listener !== 'function') return () => {};
    state.statusListeners.add(listener);
    listener(getStatus());
    return () => state.statusListeners.delete(listener);
  }

  function emitStore(type, records) {
    const payload = { type, records: clone(records) };
    state.storeListeners.forEach(listener => { try { listener(payload); } catch (_) {} });
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
      document.dispatchEvent(new root.CustomEvent('cloudsync:store-applied', { detail: payload }));
    }
  }

  function onStoreApplied(listener) {
    if (typeof listener !== 'function') return () => {};
    state.storeListeners.add(listener);
    return () => state.storeListeners.delete(listener);
  }

  function writeRemoteStore(type, records) {
    state.applyingRemote = true;
    try {
      writeJSON(STORE_KEYS[type], records);
      state.snapshots[type] = clone(records);
    } finally { state.applyingRemote = false; }
    emitStore(type, records);
  }

  function scheduleFlush() {
    if (state.flushScheduled) return;
    state.flushScheduled = true;
    Promise.resolve().then(() => { state.flushScheduled = false; flushPending(); });
  }

  function markDirty(type, id, op, payload) {
    const ownerId = currentOwnerId();
    if (!STORE_KEYS[type] || !id || !ownerId || !state.initialized) return false;
    const meta = readMeta();
    const item = { ownerId, type, id: String(id), op: op === 'delete' ? 'delete' : 'upsert',
      payload: payload == null ? null : clone(payload), expectedRevision: core.knownRevision(meta, type, String(id)),
      mutationId: mutationId(), queuedAt: Date.now() };
    writePending(core.enqueuePending(readPending(), item));
    state.error = '';
    emitStatus();
    scheduleFlush();
    return true;
  }

  function observeStoreWrite(type, records) {
    if (!STORE_KEYS[type]) return;
    const next = Array.isArray(records) ? clone(records) : [];
    const before = Array.isArray(state.snapshots[type]) ? state.snapshots[type] : [];
    state.snapshots[type] = clone(next);
    if (state.applyingRemote || !state.session || !state.initialized) return;
    const prevMap = new Map(before.filter(Boolean).map(record => [String(record.id), record]));
    const nextMap = new Map(next.filter(Boolean).map(record => [String(record.id), record]));
    nextMap.forEach((record, id) => {
      const previous = prevMap.get(id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(record)) markDirty(type, id, 'upsert', record);
    });
    prevMap.forEach((record, id) => { if (!nextMap.has(id)) markDirty(type, id, 'delete', record); });
  }

  function addConflict(item, remoteRow) {
    const list = readConflicts().filter(conflict => !(conflict.type === item.type && conflict.id === item.id));
    const base = core.buildConflict(item.payload, remoteRow || {});
    list.push({ ...base, conflictId: `${item.type}:${item.id}`, type: item.type, op: item.op,
      id: item.id, mutationId: item.mutationId || mutationId() });
    writeConflicts(list);
    emitStatus();
  }

  async function recoverUnknownRevisionDelete(item) {
    let lookup;
    try {
      lookup = await state.client.from(item.type)
        .select('id,payload,revision,updated_at,deleted_at')
        .eq('id', item.id)
        .maybeSingle();
    } catch (error) {
      return { status: 'error', error: String(error && error.message || error || 'delete recovery lookup failed') };
    }
    if (!lookup || lookup.error) {
      return { status: 'error', error: String(lookup && lookup.error && lookup.error.message || 'delete recovery lookup failed') };
    }

    const remoteRow = lookup.data || null;
    const plan = core.planUnknownRevisionDelete(remoteRow);
    if (plan.action === 'error') return { status: 'error', error: 'invalid cloud revision during delete recovery' };

    if (plan.revision > 0) {
      let meta = readMeta();
      meta = core.setKnownRevision(meta, item.type, item.id, plan.revision);
      writeMeta(meta);
    }

    if (plan.action === 'ack') {
      writePending(core.ackPendingMutation(readPending(), item.mutationId));
      if (remoteRow && remoteRow.updated_at) state.lastSyncedAt = remoteRow.updated_at;
      return { status: 'ack' };
    }

    const latest = readPending();
    if (!latest.some(entry => String(entry.mutationId || '') === String(item.mutationId || ''))) {
      return { status: 'superseded' };
    }
    writePending(core.promotePendingMutationRevision(latest, item.mutationId, plan.revision));
    return { status: 'retry' };
  }

  async function flushPending() {
    const ownerId = currentOwnerId();
    if (state.flushing || !state.client || !ownerId || !state.initialized) return;
    state.flushing = true;
    state.error = '';
    emitStatus();
    try {
      while (true) {
        const queue = readPending();
        const item = queue.find(entry => !entry.ownerId || entry.ownerId === ownerId);
        if (!item) break;

        if (item.op === 'delete' && Number(item.expectedRevision || 0) < 1) {
          const recovered = await recoverUnknownRevisionDelete(item);
          if (recovered.status === 'error') { state.error = recovered.error; break; }
          continue;
        }

        const fn = item.op === 'delete' ? 'sync_soft_delete_record' : 'sync_upsert_record';
        const args = item.op === 'delete'
          ? { p_record_type: item.type, p_record_id: item.id, p_expected_revision: Number(item.expectedRevision || 0) }
          : { p_record_type: item.type, p_record_id: item.id, p_payload: item.payload, p_expected_revision: Number(item.expectedRevision || 0) };
        let response;
        try { response = await state.client.rpc(fn, args); }
        catch (error) { state.error = String(error && error.message || error || 'network error'); break; }
        if (!response || response.error) { state.error = String(response && response.error && response.error.message || 'sync failed'); break; }
        const data = response.data || {};
        if (data.status === 'conflict') {
          addConflict(item, data.record || null);
          writePending(core.ackPendingMutation(readPending(), item.mutationId));
          continue;
        }
        if (data.status !== 'ok' || !data.record) { state.error = 'invalid sync response'; break; }
        const record = data.record;
        let meta = readMeta();
        meta = core.setKnownRevision(meta, item.type, item.id, Number(record.revision || 0));
        writeMeta(meta);
        const latest = readPending();
        const index = latest.findIndex(entry => entry.type === item.type && entry.id === item.id);
        if (index >= 0) {
          if (latest[index].mutationId === item.mutationId) latest.splice(index, 1);
          else latest[index] = { ...latest[index], expectedRevision: Number(record.revision || 0) };
          writePending(latest);
        }
        state.lastSyncedAt = record.updated_at || new Date().toISOString();
      }
    } finally { state.flushing = false; emitStatus(); }
  }

  function applyRemoteRows(type, rows) {
    const pending = readPending();
    const applicable = [];
    const conflicts = [];
    let meta = readMeta();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const id = String(row && row.id || '');
      if (!id) return;
      const pendingItem = pending.find(item => item.type === type && item.id === id);
      const known = core.knownRevision(meta, type, id);
      const decision = core.classifyRemoteRow(known, !!pendingItem, Number(row.revision || 0));
      if (decision === 'conflict') { conflicts.push([pendingItem, row]); return; }
      if (decision === 'skip') return;
      applicable.push(row);
      meta = core.setKnownRevision(meta, type, id, Number(row.revision || 0));
    });
    const applied = core.applyRemoteRows(readStore(type), applicable);
    writeRemoteStore(type, applied.records);
    writeMeta(meta);
    if (conflicts.length) {
      const conflictKeys = new Set(conflicts.map(([item]) => `${item.type}:${item.id}`));
      writePending(readPending().filter(item => !conflictKeys.has(`${item.type}:${item.id}`)));
      conflicts.forEach(([item, row]) => addConflict(item, row));
    }
  }

  async function pull(reason) {
    if (!state.client || !state.session || !state.initialized) return { status: 'skipped', reason };
    state.error = '';
    emitStatus();
    let meta = readMeta();
    let maxSeen = meta.lastPullAt || '';
    try {
      for (const type of core.TYPES) {
        let query = state.client.from(type).select('id,payload,revision,updated_at,deleted_at').order('updated_at', { ascending: true });
        if (meta.lastPullAt) query = query.gte('updated_at', meta.lastPullAt);
        const { data, error } = await query;
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        applyRemoteRows(type, rows);
        rows.forEach(row => { if (row.updated_at && (!maxSeen || row.updated_at > maxSeen)) maxSeen = row.updated_at; });
      }
      meta = readMeta(); meta.lastPullAt = maxSeen; writeMeta(meta);
      state.lastSyncedAt = maxSeen || new Date().toISOString();
      state.error = '';
      emitStatus();
      return { status: 'ok', reason };
    } catch (error) {
      state.error = String(error && error.message || error || 'pull failed');
      emitStatus();
      return { status: 'error', reason, error: state.error };
    }
  }

  async function manualSync() { await pull('manual'); await flushPending(); return getStatus(); }

  async function login(email) {
    if (!state.client) throw new Error('cloud sync not configured');
    const value = String(email || '').trim();
    if (!value) throw new Error('email required');
    const origin = root.location && root.location.origin ? root.location.origin : '';
    const pathname = root.location && root.location.pathname ? root.location.pathname : '/';
    const { error } = await state.client.auth.signInWithOtp({ email: value, options: { emailRedirectTo: origin + pathname } });
    if (error) throw error;
    return { status: 'sent' };
  }

  async function logout() {
    if (state.client) { const response = await state.client.auth.signOut(); if (response && response.error) throw response.error; }
    state.session = null;
    state.initialized = false;
    state.error = '';
    snapshotStores();
    emitStatus();
  }

  async function checkInitialized() {
    if (!state.client || !state.session) { state.initialized = false; return false; }
    const { data, error } = await state.client.from('sync_state').select('owner_id,initialized_at,schema_version').maybeSingle();
    if (error) throw error;
    state.initialized = !!data;
    return state.initialized;
  }

  function validateBaseline(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('备份文件格式无效');
    const version = Number(payload.version);
    if (version !== 2 && version !== 3) throw new Error('仅支持 version 2/3 备份');
    const users = Array.isArray(payload.users) ? payload.users : [];
    const tags = Array.isArray(payload.tags) ? payload.tags : [];
    const workTasks = Array.isArray(payload.workTasks) ? payload.workTasks : [];
    if (payload.exportedAt !== BASELINE_EXPORTED_AT || users.length !== 1060 || tags.length !== 10 || workTasks.length !== 0) {
      throw new Error('这不是已确认的 2026-08-27 初始化基线');
    }
    const tagIds = new Set();
    tags.forEach(tag => { if (!tag || !tag.id || tagIds.has(String(tag.id))) throw new Error('标签 ID 重复或缺失'); tagIds.add(String(tag.id)); });
    const customerIds = new Set();
    users.forEach(user => {
      if (!user || !user.id || customerIds.has(String(user.id))) throw new Error('客户 ID 重复或缺失');
      customerIds.add(String(user.id));
      if (!LEGAL_COLUMNS.has(String(user.column || ''))) throw new Error(`客户 ${user.id} 的阶段无效`);
      (Array.isArray(user.tags) ? user.tags : []).forEach(tagId => { if (!tagIds.has(String(tagId))) throw new Error(`客户 ${user.id} 引用了不存在的标签`); });
    });
    return { users: clone(users), tags: clone(tags), workTasks: clone(workTasks) };
  }

  async function initializeFromBackup(payload) {
    if (!state.client || !state.session) throw new Error('请先登录云同步');
    if (await checkInitialized()) { await pull('already-initialized'); return { status: 'already_initialized' }; }
    const data = validateBaseline(payload);
    const groups = [['customers', data.users], ['tags', data.tags], ['work_tasks', data.workTasks]];
    for (const [type, records] of groups) {
      for (let index = 0; index < records.length; index += 12) {
        const chunk = records.slice(index, index + 12);
        const results = await Promise.all(chunk.map(record => state.client.rpc('sync_initialize_record', {
          p_record_type: type, p_record_id: String(record.id), p_payload: record })));
        for (const result of results) { if (result.error) throw result.error; if (!result.data || result.data.status !== 'ok') throw new Error(`初始化 ${type} 失败`); }
      }
    }
    const finalized = await state.client.rpc('sync_finalize_initialization', { p_schema_version: 1 });
    if (finalized.error) throw finalized.error;
    state.initialized = true;
    writeRemoteStore('customers', data.users);
    writeRemoteStore('tags', data.tags);
    writeRemoteStore('work_tasks', data.workTasks);
    let meta = readMeta(); meta.initializedSource = BASELINE_EXPORTED_AT; writeMeta(meta);
    await pull('initialized');
    emitStatus();
    return { status: 'ok', customers: data.users.length, tags: data.tags.length, workTasks: data.workTasks.length };
  }

  async function resolveConflict(conflictId, choice) {
    const conflict = readConflicts().find(item => item.conflictId === conflictId);
    if (!conflict) return { status: 'missing' };
    if (choice === 'remote') {
      applyRemoteRows(conflict.type, [{ id: conflict.id, payload: conflict.remotePayload, revision: conflict.remoteRevision,
        updated_at: conflict.remoteUpdatedAt || null, deleted_at: conflict.remoteDeletedAt || null }]);
      writeConflicts(readConflicts().filter(item => item.conflictId !== conflictId));
      writePending(readPending().filter(item => !(item.type === conflict.type && item.id === conflict.id)));
      emitStatus();
      return { status: 'ok', choice: 'remote' };
    }
    if (choice === 'local') {
      const { data, error } = await state.client.from(conflict.type).select('id,payload,revision,updated_at,deleted_at').eq('id', conflict.id).maybeSingle();
      if (error) throw error;
      const expectedRevision = Number(data && data.revision || 0);
      const fn = conflict.op === 'delete' ? 'sync_soft_delete_record' : 'sync_upsert_record';
      const args = conflict.op === 'delete'
        ? { p_record_type: conflict.type, p_record_id: conflict.id, p_expected_revision: expectedRevision }
        : { p_record_type: conflict.type, p_record_id: conflict.id, p_payload: conflict.localPayload, p_expected_revision: expectedRevision };
      const response = await state.client.rpc(fn, args);
      if (response.error) throw response.error;
      if (!response.data || response.data.status !== 'ok') {
        addConflict({ ...conflict, expectedRevision, mutationId: mutationId(), payload: conflict.localPayload }, response.data && response.data.record);
        return { status: 'conflict' };
      }
      let meta = readMeta(); meta = core.setKnownRevision(meta, conflict.type, conflict.id, Number(response.data.record.revision || 0)); writeMeta(meta);
      writeConflicts(readConflicts().filter(item => item.conflictId !== conflictId));
      writePending(readPending().filter(item => !(item.type === conflict.type && item.id === conflict.id)));
      state.lastSyncedAt = response.data.record.updated_at || new Date().toISOString();
      emitStatus();
      return { status: 'ok', choice: 'local' };
    }
    throw new Error('unknown conflict choice');
  }

  function debouncePull() { clearTimeout(state.pullTimer); state.pullTimer = setTimeout(() => pull('focus'), 250); }

  function installLifecycle() {
    if (state.lifecycleInstalled) return;
    state.lifecycleInstalled = true;
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('focus', debouncePull);
      root.addEventListener('online', () => { state.error = ''; manualSync(); });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') debouncePull(); });
    }
  }

  async function handleSession(session, reason) {
    state.session = session || null;
    state.error = '';
    if (!state.session) { state.initialized = false; snapshotStores(); emitStatus(); return; }
    adoptOwner(state.session.user && state.session.user.id);
    snapshotStores();
    try { await checkInitialized(); if (state.initialized) { await pull(reason); await flushPending(); } }
    catch (error) { state.error = String(error && error.message || error); }
    emitStatus();
  }

  async function init() {
    installLifecycle();
    snapshotStores();
    const cfg = root.CLOUD_SYNC_CONFIG;
    if (!cfg || !cfg.url || !cfg.publishableKey || !root.supabase || typeof root.supabase.createClient !== 'function') {
      emitStatus();
      return { status: 'local_only' };
    }
    state.client = root.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const sessionResult = await state.client.auth.getSession();
    await handleSession(sessionResult && sessionResult.data && sessionResult.data.session || null, 'startup');
    state.client.auth.onAuthStateChange((_event, session) => { Promise.resolve().then(() => handleSession(session, 'auth')); });
    emitStatus();
    return { status: state.session ? 'authenticated' : 'signed_out' };
  }

  function _setTestState(patch) {
    Object.assign(state, patch || {});
    if (patch && patch.session && patch.session.user) adoptOwner(patch.session.user.id);
    installLifecycle();
    emitStatus();
  }

  installLifecycle();

  root.CloudSync = { init, login, logout, observeStoreWrite, markDirty, pull, flushPending, manualSync, getStatus, onStatus,
    onStoreApplied, initializeFromBackup, resolveConflict, validateBaseline, _setTestState, _snapshotStores: snapshotStores,
    constants: { STORE_KEYS, META_KEY, PENDING_KEY, CONFLICT_KEY, BASELINE_EXPORTED_AT } };
})(typeof globalThis !== 'undefined' ? globalThis : window);