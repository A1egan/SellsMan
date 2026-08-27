const assert = require('assert');
const core = require('../assets/workspace-v2-core.js');

assert.equal(core.normalizeRoute(''), 'home');
assert.equal(core.normalizeRoute('#home'), 'home');
assert.equal(core.normalizeRoute('#board'), 'board');
assert.equal(core.normalizeRoute('#unknown'), 'home');
assert.equal(core.isAuthCallbackHash('#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=magiclink'), true);
assert.equal(core.isAuthCallbackHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'), true);
assert.equal(core.isAuthCallbackHash('#home'), false);
assert.equal(core.isAuthCallbackHash('#board'), false);

const authStorage = {
  values: new Map(),
  setItem(key, value) { this.values.set(String(key), String(value)); },
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; },
  removeItem(key) { this.values.delete(String(key)); },
};
const magicHash = '#access_token=abc&refresh_token=def&token_type=bearer&type=magiclink';
assert.equal(core.captureAuthCallbackHash(magicHash, authStorage), true);
assert.equal(core.takeAuthCallbackHash(authStorage), magicHash);
assert.equal(core.takeAuthCallbackHash(authStorage), '');
assert.equal(core.captureAuthCallbackHash('#home', authStorage), false);

const planned = core.createTask({
  title: '回访 #2877',
  plannedDate: '2026-08-27',
  priority: 'important',
  linkedCustomerId: 'u_2877',
  status: 'planned'
}, 1000);
assert.ok(planned.id.startsWith('wt_'));
assert.equal(planned.title, '回访 #2877');
assert.equal(planned.status, 'planned');
assert.equal(planned.priority, 'important');
assert.equal(planned.linkedCustomerId, 'u_2877');
assert.equal(planned.createdAt, 1000);

const activeTask = core.createTask({
  title: '今天要做',
  plannedDate: '2026-08-26',
  status: 'active'
}, 1001);
assert.equal(activeTask.status, 'active');
assert.equal(activeTask.activatedAt, 1001);

const completed = core.normalizeTask({
  ...planned,
  id: 'wt_done',
  status: 'completed',
  completedAt: 1500
});

const rollover = core.getRolloverCandidates([planned, completed], '2026-08-27');
assert.deepEqual(rollover.map(t => t.id), [planned.id]);

const activated = core.activateTasks([planned], [planned.id], 2000);
assert.equal(activated[0].status, 'active');
assert.equal(activated[0].activatedAt, 2000);

const deferred = core.deferTasks([planned], [planned.id], 2100);
assert.equal(deferred[0].status, 'deferred');
assert.equal(deferred[0].deferredAt, 2100);

const justCompleted = core.completeTasks([activeTask], [activeTask.id], 2200);
assert.equal(justCompleted[0].status, 'completed');
assert.equal(justCompleted[0].completedAt, 2200);
const reopened = core.reopenTasks(justCompleted, [activeTask.id], 2300);
assert.equal(reopened[0].status, 'active');
assert.equal(reopened[0].completedAt, 0);

const sorted = core.sortTasks([
  core.normalizeTask({ id: 'n', title: 'normal', status: 'active', priority: 'normal', sortOrder: 3 }),
  core.normalizeTask({ id: 'u', title: 'urgent', status: 'active', priority: 'urgent', sortOrder: 9 }),
  core.normalizeTask({ id: 'i', title: 'important', status: 'active', priority: 'important', sortOrder: 1 }),
]);
assert.deepEqual(sorted.map(t => t.id), ['u', 'i', 'n']);

const partition = core.partitionTasks([
  activeTask,
  completed,
  planned,
  deferred[0],
], '2026-08-27');
assert.equal(partition.active.length, 1);
assert.equal(partition.completed.length, 1);
assert.equal(partition.rollover.length, 1);
assert.equal(partition.deferred.length, 1);

const malformed = core.normalizeTask({ id: '', title: 123, status: '???', priority: '???', sortOrder: 'x' });
assert.ok(malformed.id.startsWith('wt_'));
assert.equal(malformed.title, '123');
assert.equal(malformed.status, 'active');
assert.equal(malformed.priority, 'normal');
assert.equal(malformed.sortOrder, 0);

console.log('Workspace v2 core OK');
