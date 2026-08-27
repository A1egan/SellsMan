const assert = require('assert');

let ux;
try {
  ux = require('../assets/workspace-ux-patch.js');
} catch (error) {
  assert.fail(`workspace UX patch module must load: ${error && (error.code || error.message)}`);
}

assert.equal(
  ux.shouldStampSuccessfulSync({ mode: 'synced', pendingCount: 0, conflictCount: 0, error: '' }),
  true,
  'clean fully-synced status should receive a fresh successful-sync timestamp'
);
assert.equal(
  ux.shouldStampSuccessfulSync({ mode: 'offline', pendingCount: 1, conflictCount: 0, error: 'offline' }),
  false,
  'offline sync must never be stamped successful'
);
assert.equal(
  ux.shouldStampSuccessfulSync({ mode: 'conflict', pendingCount: 0, conflictCount: 1, error: '' }),
  false,
  'conflicted sync must never be stamped successful'
);

const older = { mode: 'synced', pendingCount: 0, conflictCount: 0, error: '', lastSyncedAt: '2026-08-27T06:27:00.000Z' };
const decorated = ux.decorateSyncStatus(older, '2026-08-27T06:45:00.000Z');
assert.equal(decorated.lastSyncedAt, '2026-08-27T06:45:00.000Z', 'newer successful check time should win over last remote-row timestamp');

const stages = ux.getStageOptions([
  { id: 'pending', name: '待跟进' },
  { id: 'contacting', name: '高意向' },
  { id: 'replied', name: '一般' },
  { id: 'lowinterest', name: '低意向池' },
  { id: 'silent', name: '沉默用户' },
], 'contacting');
assert.deepEqual(stages.map(item => item.id), ['pending', 'contacting', 'replied', 'lowinterest', 'silent']);
assert.equal(stages.find(item => item.id === 'contacting').current, true, 'current stage should be identified without removing other choices');
assert.equal(stages.filter(item => !item.current).length, 4, 'customer can move directly to any of the other four stages');

console.log('workspace UX patch tests OK');
