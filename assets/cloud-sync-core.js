(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CloudSyncCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const TYPES = ['customers', 'tags', 'work_tasks'];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeRevisionMap(raw) {
    const out = {};
    TYPES.forEach(type => {
      out[type] = {};
      const source = raw && raw[type] && typeof raw[type] === 'object' ? raw[type] : {};
      Object.keys(source).forEach(id => {
        const n = Number(source[id]);
        if (Number.isFinite(n) && n >= 0) out[type][String(id)] = Math.floor(n);
      });
    });
    return out;
  }

  function normalizeMeta(raw, ownerId) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      ownerId: String(ownerId || src.ownerId || ''),
      revisions: normalizeRevisionMap(src.revisions),
      lastPullAt: src.lastPullAt ? String(src.lastPullAt) : '',
      initializedSource: src.initializedSource ? String(src.initializedSource) : '',
    };
  }

  function knownRevision(meta, type, id) {
    const n = meta && meta.revisions && meta.revisions[type]
      ? Number(meta.revisions[type][String(id)])
      : 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  function setKnownRevision(meta, type, id, revision) {
    const out = normalizeMeta(meta, meta && meta.ownerId);
    if (!TYPES.includes(type)) return out;
    const n = Number(revision);
    out.revisions[type][String(id)] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    return out;
  }

  function enqueuePending(queue, item) {
    const src = item && typeof item === 'object' ? item : {};
    const keyType = String(src.type || '');
    const keyId = String(src.id || '');
    if (!TYPES.includes(keyType) || !keyId) return Array.isArray(queue) ? queue.slice() : [];
    const next = (Array.isArray(queue) ? queue : []).filter(entry => !(String(entry.type) === keyType && String(entry.id) === keyId));
    next.push(clone({
      ownerId: String(src.ownerId || ''),
      type: keyType,
      id: keyId,
      op: src.op === 'delete' ? 'delete' : 'upsert',
      expectedRevision: Math.max(0, Math.floor(Number(src.expectedRevision) || 0)),
      mutationId: String(src.mutationId || ''),
      payload: src.payload == null ? null : clone(src.payload),
      queuedAt: Number(src.queuedAt || Date.now()),
    }));
    return next;
  }

  function ackPending(queue, type, id) {
    return (Array.isArray(queue) ? queue : []).filter(entry => !(String(entry.type) === String(type) && String(entry.id) === String(id)));
  }

  function classifyRemoteRow(known, hasPending, remote) {
    if (!hasPending) return 'apply';
    const knownRevision = Math.max(0, Math.floor(Number(known) || 0));
    const remoteRevision = Math.max(0, Math.floor(Number(remote) || 0));
    return remoteRevision > knownRevision ? 'conflict' : 'skip';
  }

  function applyRemoteRows(localRecords, rows) {
    const map = new Map((Array.isArray(localRecords) ? localRecords : []).map(record => [String(record.id), clone(record)]));
    const tombstones = [];
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const id = String(row && row.id || '');
      if (!id) return;
      if (row.deleted_at) {
        map.delete(id);
        tombstones.push({ id, revision: Number(row.revision || 0), deletedAt: String(row.deleted_at) });
        return;
      }
      if (row.payload && typeof row.payload === 'object') map.set(id, clone(row.payload));
    });
    return { records: Array.from(map.values()), tombstones };
  }

  function buildConflict(localPayload, remoteRow) {
    const remote = remoteRow && typeof remoteRow === 'object' ? remoteRow : {};
    return {
      id: String(remote.id || (localPayload && localPayload.id) || ''),
      localPayload: clone(localPayload),
      remotePayload: clone(remote.payload),
      remoteRevision: Math.max(0, Math.floor(Number(remote.revision) || 0)),
      remoteUpdatedAt: remote.updated_at ? String(remote.updated_at) : '',
      remoteDeletedAt: remote.deleted_at ? String(remote.deleted_at) : '',
    };
  }

  function normalizeBackupUsers(users) {
    return (Array.isArray(users) ? users : []).map(raw => {
      const user = raw && typeof raw === 'object' ? clone(raw) : {};
      user.id = String(user.id || '');
      user.number = String(user.number == null ? '' : user.number);
      user.tags = Array.isArray(user.tags) ? user.tags.map(String) : [];
      user.history = Array.isArray(user.history) ? user.history : [];
      return user;
    });
  }

  function normalizeBackupForRestore(payload, fallbackTasks) {
    const fallback = Array.isArray(fallbackTasks) ? clone(fallbackTasks) : [];
    if (Array.isArray(payload)) {
      return { version: 0, users: normalizeBackupUsers(payload), tags: [], workTasks: fallback };
    }
    const src = payload && typeof payload === 'object' ? payload : {};
    const version = Number(src.version || 0);
    const users = normalizeBackupUsers(src.users);
    const tags = Array.isArray(src.tags) ? clone(src.tags) : [];
    const workTasks = (version === 2 || version === 3)
      ? (Array.isArray(src.workTasks) ? clone(src.workTasks) : [])
      : fallback;
    return { version, users, tags, workTasks };
  }

  return {
    TYPES: TYPES.slice(),
    normalizeMeta,
    enqueuePending,
    ackPending,
    classifyRemoteRow,
    knownRevision,
    setKnownRevision,
    applyRemoteRows,
    buildConflict,
    normalizeBackupForRestore,
  };
});
