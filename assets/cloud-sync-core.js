(function (root) {
  'use strict';

  const TYPES = ['customers', 'tags', 'work_tasks'];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function blankRevisions() {
    return { customers: {}, tags: {}, work_tasks: {} };
  }

  function normalizeMeta(raw, ownerId) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const revisions = blankRevisions();
    for (const type of TYPES) {
      const incoming = source.revisions && source.revisions[type];
      if (!incoming || typeof incoming !== 'object') continue;
      for (const [id, revision] of Object.entries(incoming)) {
        const n = Number(revision);
        if (Number.isInteger(n) && n >= 0) revisions[type][id] = n;
      }
    }
    return {
      ownerId: ownerId || source.ownerId || '',
      revisions,
      lastPullAt: typeof source.lastPullAt === 'string' ? source.lastPullAt : '',
      initializedSource: source.initializedSource || ''
    };
  }

  function knownRevision(meta, type, id) {
    const n = meta && meta.revisions && meta.revisions[type] && meta.revisions[type][id];
    return Number.isInteger(Number(n)) && Number(n) >= 0 ? Number(n) : 0;
  }

  function setKnownRevision(meta, type, id, revision) {
    const next = normalizeMeta(meta, meta && meta.ownerId);
    if (!TYPES.includes(type)) return next;
    const n = Number(revision);
    if (!Number.isInteger(n) || n < 0) return next;
    next.revisions[type][id] = n;
    return next;
  }

  function enqueuePending(queue, item) {
    const next = Array.isArray(queue)
      ? queue.filter(x => !(x && x.type === item.type && x.id === item.id))
      : [];
    next.push(clone(item));
    return next;
  }

  function ackPending(queue, type, id) {
    return Array.isArray(queue)
      ? queue.filter(x => !(x && x.type === type && x.id === id))
      : [];
  }

  function applyRemoteRows(localRecords, rows) {
    const map = new Map((Array.isArray(localRecords) ? localRecords : [])
      .filter(Boolean)
      .map(record => [record.id, clone(record)]));
    const tombstones = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || !row.id) continue;
      if (row.deleted_at) {
        map.delete(row.id);
        tombstones.push(row.id);
      } else if (row.payload && typeof row.payload === 'object') {
        map.set(row.id, clone(row.payload));
      }
    }
    return { records: Array.from(map.values()), tombstones };
  }

  function buildConflict(localPayload, remoteRow) {
    return {
      id: remoteRow && remoteRow.id || localPayload && localPayload.id || '',
      local: clone(localPayload || null),
      remote: clone(remoteRow && remoteRow.payload || null),
      remoteRevision: Number(remoteRow && remoteRow.revision || 0),
      remoteDeletedAt: remoteRow && remoteRow.deleted_at || null
    };
  }

  root.CloudSyncCore = {
    TYPES,
    normalizeMeta,
    enqueuePending,
    ackPending,
    knownRevision,
    setKnownRevision,
    applyRemoteRows,
    buildConflict
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
