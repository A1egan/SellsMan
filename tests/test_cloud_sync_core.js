const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../assets/cloud-sync-core.js');

const meta = core.normalizeMeta({ revisions: { customers: { u_1: 7 } } }, 'owner-a');
assert.equal(meta.ownerId, 'owner-a');
assert.equal(core.knownRevision(meta, 'customers', 'u_1'), 7);
assert.equal(core.knownRevision(meta, 'tags', 'missing'), 0);

let q = core.enqueuePending([], {
  ownerId: 'owner-a', type: 'customers', id: 'u_1', op: 'upsert', expectedRevision: 7,
  mutationId: 'm_first', payload: { number: '强化2群' }
});
q = core.enqueuePending(q, {
  ownerId: 'owner-a', type: 'customers', id: 'u_1', op: 'upsert', expectedRevision: 7,
  mutationId: 'm_second', payload: { number: '进度慢刚开计组' }
});
assert.equal(q.length, 1);
assert.equal(q[0].payload.number, '进度慢刚开计组');
assert.equal(q[0].ownerId, 'owner-a', 'pending work must remain bound to its authenticated owner');
assert.equal(q[0].mutationId, 'm_second', 'newer same-record mutation must retain its identity');
q = core.ackPending(q, 'customers', 'u_1');
assert.equal(q.length, 0);

const raceQueue = [
  { type: 'work_tasks', id: 'wt_1', mutationId: 'm_old_delete', op: 'delete', expectedRevision: 0 },
  { type: 'customers', id: 'u_2', mutationId: 'm_other', op: 'upsert', expectedRevision: 2 },
];
assert.deepEqual(
  core.ackPendingMutation(raceQueue, 'm_old_delete'),
  [raceQueue[1]],
  'recovery must acknowledge only the exact mutation it inspected'
);
assert.deepEqual(
  core.ackPendingMutation([{ ...raceQueue[0], mutationId: 'm_newer' }], 'm_old_delete'),
  [{ ...raceQueue[0], mutationId: 'm_newer' }],
  'a newer same-record mutation must survive acknowledgement of an older mutation'
);
assert.deepEqual(
  core.promotePendingMutationRevision(raceQueue, 'm_old_delete', 4),
  [{ ...raceQueue[0], expectedRevision: 4 }, raceQueue[1]],
  'recovery should promote only the exact delete mutation to the recovered revision'
);
assert.deepEqual(
  core.promotePendingMutationRevision([{ ...raceQueue[0], mutationId: 'm_newer' }], 'm_old_delete', 4),
  [{ ...raceQueue[0], mutationId: 'm_newer' }],
  'a newer same-record mutation must not inherit an older delete probe revision'
);

assert.deepEqual(
  core.planUnknownRevisionDelete(null),
  { action: 'ack', revision: 0 },
  'deleting a never-uploaded record is already satisfied when cloud has no row'
);
assert.deepEqual(
  core.planUnknownRevisionDelete({ id: 'wt_1', revision: 4, deleted_at: null }),
  { action: 'delete', revision: 4 },
  'an existing cloud row must be deleted using its real revision'
);
assert.deepEqual(
  core.planUnknownRevisionDelete({ id: 'wt_1', revision: 5, deleted_at: '2026-08-28T06:00:00Z' }),
  { action: 'ack', revision: 5 },
  'an existing tombstone already satisfies the local delete'
);
assert.deepEqual(
  core.planUnknownRevisionDelete({ id: 'wt_1', revision: 0, deleted_at: null }),
  { action: 'error', revision: 0 },
  'an impossible cloud row without a positive revision must not be silently accepted'
);

assert.equal(core.classifyRemoteRow(7, false, 7), 'apply');
assert.equal(core.classifyRemoteRow(7, true, 7), 'skip', 'same-revision remote row must not overwrite a local pending edit');
assert.equal(core.classifyRemoteRow(7, true, 6), 'skip', 'older remote row must not overwrite a local pending edit');
assert.equal(core.classifyRemoteRow(7, true, 8), 'conflict', 'newer remote row must surface a conflict');

const updatedMeta = core.setKnownRevision(meta, 'tags', 'tag_1', 3);
assert.equal(core.knownRevision(updatedMeta, 'tags', 'tag_1'), 3);
assert.equal(core.knownRevision(meta, 'tags', 'tag_1'), 0, 'setKnownRevision must not mutate input');

const remote = core.applyRemoteRows(
  [{ id: 'u_1', number: '强化2群' }, { id: 'u_2', number: '1234' }],
  [
    { id: 'u_1', payload: { id: 'u_1', number: '进度慢刚开计组' }, revision: 8, updated_at: '2026-08-27T02:00:00Z', deleted_at: null },
    { id: 'u_2', payload: { id: 'u_2', number: '1234' }, revision: 2, updated_at: '2026-08-27T02:01:00Z', deleted_at: '2026-08-27T02:02:00Z' },
  ]
);
assert.deepEqual(remote.records, [{ id: 'u_1', number: '进度慢刚开计组' }]);
assert.equal(remote.records[0].number, '进度慢刚开计组');
assert.deepEqual(remote.tombstones, [{ id: 'u_2', revision: 2, deletedAt: '2026-08-27T02:02:00Z' }]);

const conflict = core.buildConflict(
  { id: 'u_1', number: '本机版本', note: 'local' },
  { id: 'u_1', payload: { id: 'u_1', number: '云端版本', note: 'remote' }, revision: 9, updated_at: '2026-08-27T02:03:00Z', deleted_at: null }
);
assert.equal(conflict.id, 'u_1');
assert.equal(conflict.localPayload.note, 'local');
assert.equal(conflict.remotePayload.note, 'remote');
assert.equal(conflict.remoteRevision, 9);

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cloud-sync-v2-shape.json'), 'utf8'));
const restoredV2 = core.normalizeBackupForRestore(fixture, [{ id: 'old_task' }]);
assert.equal(restoredV2.version, 2);
assert.equal(restoredV2.workTasks.length, 0, 'v2 backup must restore with empty work tasks');
assert.equal(restoredV2.users.find(user => user.id === 'synthetic_text').number, '强化2群');
assert.equal(typeof restoredV2.users.find(user => user.id === 'synthetic_text').number, 'string');
assert.equal(restoredV2.users[0].history[0].note, 'synthetic history');

const restoredV3 = core.normalizeBackupForRestore({
  ...fixture,
  version: 3,
  workTasks: [{ id: 'wt_1', title: 'synthetic task' }]
}, []);
assert.deepEqual(restoredV3.workTasks, [{ id: 'wt_1', title: 'synthetic task' }]);

const restoredLegacy = core.normalizeBackupForRestore([{ id: 'legacy', number: 123 }], [{ id: 'keep_task' }]);
assert.equal(restoredLegacy.version, 0);
assert.deepEqual(restoredLegacy.workTasks, [{ id: 'keep_task' }], 'legacy array restore must not silently erase modern tasks');
assert.equal(restoredLegacy.users[0].number, '123');

console.log('cloud sync core tests OK');
