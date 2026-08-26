(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WorkspaceV2Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ROUTES = new Set(['home', 'tasks', 'board', 'search', 'analytics', 'batch']);
  const STATUSES = new Set(['planned', 'active', 'deferred', 'completed']);
  const PRIORITIES = new Set(['normal', 'important', 'urgent']);
  const PRIORITY_RANK = { urgent: 0, important: 1, normal: 2 };
  let seq = 0;

  function dateKey(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function makeId(now) {
    seq += 1;
    const n = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return `wt_${n}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function normalizeRoute(hash) {
    const value = String(hash || '').replace(/^#/, '').trim();
    return ROUTES.has(value) ? value : 'home';
  }

  function normalizeTask(task) {
    const src = task && typeof task === 'object' ? task : {};
    const status = STATUSES.has(src.status) ? src.status : 'active';
    const priority = PRIORITIES.has(src.priority) ? src.priority : 'normal';
    const createdAt = Number(src.createdAt || 0) || Date.now();
    return {
      id: String(src.id || makeId(createdAt)),
      title: String(src.title == null ? '' : src.title).trim(),
      plannedDate: dateKey(src.plannedDate || src.date || createdAt),
      status,
      priority,
      linkedCustomerId: src.linkedCustomerId ? String(src.linkedCustomerId) : '',
      createdAt,
      activatedAt: Number(src.activatedAt || 0),
      completedAt: Number(src.completedAt || 0),
      deferredAt: Number(src.deferredAt || 0),
      sortOrder: Number.isFinite(Number(src.sortOrder)) ? Number(src.sortOrder) : 0,
    };
  }

  function createTask(input, now) {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const src = input && typeof input === 'object' ? input : {};
    const status = STATUSES.has(src.status) ? src.status : 'active';
    return normalizeTask({
      ...src,
      id: src.id || makeId(ts),
      createdAt: ts,
      activatedAt: status === 'active' ? ts : Number(src.activatedAt || 0),
      completedAt: status === 'completed' ? (Number(src.completedAt || 0) || ts) : Number(src.completedAt || 0),
      deferredAt: status === 'deferred' ? (Number(src.deferredAt || 0) || ts) : Number(src.deferredAt || 0),
    });
  }

  function getRolloverCandidates(tasks, today) {
    const key = dateKey(today);
    return (Array.isArray(tasks) ? tasks : [])
      .map(normalizeTask)
      .filter(task => task.status === 'planned' && task.plannedDate && task.plannedDate <= key)
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  }

  function mutateSelected(tasks, ids, patcher) {
    const selected = new Set((ids || []).map(String));
    return (Array.isArray(tasks) ? tasks : []).map(raw => {
      const task = normalizeTask(raw);
      return selected.has(task.id) ? normalizeTask(patcher(task)) : task;
    });
  }

  function activateTasks(tasks, ids, now) {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return mutateSelected(tasks, ids, task => ({
      ...task,
      status: 'active',
      activatedAt: ts,
      deferredAt: 0,
    }));
  }

  function deferTasks(tasks, ids, now) {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return mutateSelected(tasks, ids, task => ({
      ...task,
      status: 'deferred',
      deferredAt: ts,
    }));
  }

  function completeTasks(tasks, ids, now) {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return mutateSelected(tasks, ids, task => ({
      ...task,
      status: 'completed',
      completedAt: ts,
    }));
  }

  function reopenTasks(tasks, ids, now) {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return mutateSelected(tasks, ids, task => ({
      ...task,
      status: 'active',
      activatedAt: ts,
      completedAt: 0,
      deferredAt: 0,
    }));
  }

  function sortTasks(tasks) {
    return (Array.isArray(tasks) ? tasks : []).map(normalizeTask).sort((a, b) => {
      const doneA = a.status === 'completed' ? 1 : 0;
      const doneB = b.status === 'completed' ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      const pa = PRIORITY_RANK[a.priority] ?? 9;
      const pb = PRIORITY_RANK[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    });
  }

  function partitionTasks(tasks, today) {
    const key = dateKey(today);
    const normalized = (Array.isArray(tasks) ? tasks : []).map(normalizeTask);
    return {
      active: sortTasks(normalized.filter(t => t.status === 'active')),
      completed: sortTasks(normalized.filter(t => t.status === 'completed')),
      planned: sortTasks(normalized.filter(t => t.status === 'planned' && t.plannedDate > key)),
      rollover: getRolloverCandidates(normalized, key),
      deferred: sortTasks(normalized.filter(t => t.status === 'deferred')),
    };
  }

  return {
    ROUTES: Array.from(ROUTES),
    STATUSES: Array.from(STATUSES),
    PRIORITIES: Array.from(PRIORITIES),
    dateKey,
    normalizeRoute,
    normalizeTask,
    createTask,
    getRolloverCandidates,
    activateTasks,
    deferTasks,
    completeTasks,
    reopenTasks,
    sortTasks,
    partitionTasks,
  };
});
