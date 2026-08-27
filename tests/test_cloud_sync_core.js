const assert = require('assert');
const core = require('../assets/cloud-sync-core.js');

const meta = core.normalizeMeta({ revisions: { customers: { u_1: 7 } } }, 'owner-a');
assert.equal(meta.ownerId, 'owner-a');
assert.equal(core.knownRevision(meta, 'customers', 'u_1'), 7);
assert.equal(core.knownRevision(meta, 'tags', 'missing'), 0);

let q = core.enqueuePending([], { type: 'customers', id: 'u_1', op: 'upsert', expectedRevision: 7, payload: { number: '强化2群' } });
q = core.enqueuePending(q, { type: 'customers', id: 'u_1', op: 'upsert', expectedRevision: 7, payload: { number: '进度慢刚开计组' } });
assert.equal(q.length, 1);
assert.equal(q[0].payload.number, '进度慢刚开计组');
q = core.ackPending(q, 'customers', 'u_1');
assert.equal(q.length, 0);

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

console.log('cloud sync core tests OK');
