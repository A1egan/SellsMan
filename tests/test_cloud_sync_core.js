const assert = require('assert');
require('../assets/cloud-sync-core.js');
const core = globalThis.CloudSyncCore;

assert.equal(core.knownRevision({revisions:{customers:{u_1:7}}}, 'customers', 'u_1'), 7);
assert.equal(core.knownRevision({}, 'customers', 'u_1'), 0);

let q = core.enqueuePending([], {type:'customers', id:'u_1', op:'upsert', expectedRevision:7, payload:{number:'1'}});
q = core.enqueuePending(q, {type:'customers', id:'u_1', op:'upsert', expectedRevision:7, payload:{number:'进度慢刚开计组'}});
assert.equal(q.length, 1);
assert.equal(q[0].payload.number, '进度慢刚开计组');
q = core.ackPending(q, 'customers', 'u_1');
assert.equal(q.length, 0);

let meta = core.normalizeMeta(null, 'owner-a');
assert.equal(meta.ownerId, 'owner-a');
meta = core.setKnownRevision(meta, 'customers', 'u_1', 9);
assert.equal(core.knownRevision(meta, 'customers', 'u_1'), 9);

const applied = core.applyRemoteRows([
  {id:'u_1', number:'123'},
  {id:'u_text', number:'强化2群'}
], [
  {id:'u_1', payload:{id:'u_1', number:'123', note:'new'}, revision:2, deleted_at:null},
  {id:'u_text', payload:{id:'u_text', number:'强化2群'}, revision:3, deleted_at:null},
  {id:'u_dead', payload:{id:'u_dead', number:'999'}, revision:4, deleted_at:'2026-08-27T00:00:00Z'}
]);
assert.equal(applied.records.find(x => x.id === 'u_1').note, 'new');
assert.equal(applied.records.find(x => x.id === 'u_text').number, '强化2群');
assert.ok(applied.tombstones.includes('u_dead'));

const conflict = core.buildConflict({id:'u_1', number:'123', note:'local'}, {id:'u_1', payload:{id:'u_1',number:'123',note:'remote'}, revision:8, deleted_at:null});
assert.equal(conflict.local.note, 'local');
assert.equal(conflict.remote.note, 'remote');
assert.equal(conflict.remoteRevision, 8);

console.log('cloud-sync-core: ok');
