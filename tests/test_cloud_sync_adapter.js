const assert = require('assert');

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(String(k), String(v)); }
  removeItem(k){ this.map.delete(String(k)); }
  clear(){ this.map.clear(); }
}

global.localStorage = new MemoryStorage();
global.location = { origin: 'https://a1egan.github.io', pathname: '/SellsMan/' };
const windowHandlers = {};
global.addEventListener = (name, fn) => { (windowHandlers[name] ||= []).push(fn); };
const documentHandlers = {};
global.document = {
  visibilityState: 'visible',
  addEventListener(name, fn){ (documentHandlers[name] ||= []).push(fn); },
  dispatchEvent(){},
};
global.CustomEvent = class CustomEvent { constructor(name, init){ this.type=name; this.detail=init && init.detail; } };

global.CloudSyncCore = require('../assets/cloud-sync-core.js');
require('../assets/cloud-sync.js');

function queryClient(remoteRow, onRpc) {
  return {
    rpc(fn, args){ return onRpc ? onRpc(fn, args) : Promise.resolve({data:null,error:null}); },
    from(){
      const chain = {
        select(){ return chain; }, order(){ return chain; }, gte(){ return chain; }, eq(){ return chain; },
        maybeSingle(){ return Promise.resolve({data:remoteRow || null,error:null}); },
        then(resolve, reject){ return Promise.resolve({data:[],error:null}).then(resolve, reject); }
      };
      return chain;
    },
    auth: {
      signInWithOtp: async () => ({error:null}),
      signOut: async () => ({error:null})
    }
  };
}

(async () => {
  const key = 'sales_followup_data_v3';
  const pendingKey = 'sales_cloud_pending_v1';
  const metaKey = 'sales_cloud_sync_meta_v1';
  const initial = [{id:'u_1', number:'强化2群', note:'old'}];
  localStorage.setItem(key, JSON.stringify(initial));

  let rpcResolve;
  let rpcCalls = 0;
  let fromCalls = 0;
  const fakeClient = {
    rpc(){ rpcCalls++; return new Promise(resolve => { rpcResolve = resolve; }); },
    from(){
      fromCalls++;
      const chain = {
        select(){ return chain; }, order(){ return chain; }, gte(){ return chain; }, eq(){ return chain; },
        maybeSingle(){ return Promise.resolve({data:null,error:null}); },
        then(resolve, reject){ return Promise.resolve({data:[],error:null}).then(resolve, reject); }
      };
      return chain;
    },
    auth: {
      signInWithOtp: async () => ({error:new Error('auth failed')}),
      signOut: async () => ({error:null})
    }
  };

  CloudSync._setTestState({client:fakeClient, session:{user:{id:'owner-a',email:'a@example.com'}}, initialized:true, error:'', flushing:false});
  CloudSync._snapshotStores();

  const changed = [{id:'u_1', number:'强化2群', note:'new'}];
  localStorage.setItem(key, JSON.stringify(changed));
  CloudSync.observeStoreWrite('customers', changed);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(JSON.parse(localStorage.getItem(key))[0].note, 'new', 'local write must happen first');
  assert.equal(JSON.parse(localStorage.getItem(pendingKey)).length, 1, 'pending must persist before network finishes');
  assert.equal(rpcCalls, 1, 'flush should start after local enqueue');

  rpcResolve({data:null,error:new Error('offline')});
  await new Promise(r => setTimeout(r, 10));
  assert.equal(JSON.parse(localStorage.getItem(pendingKey)).length, 1, 'network failure must retain pending');
  assert.equal(JSON.parse(localStorage.getItem(key))[0].note, 'new', 'network failure must retain local data');

  await assert.rejects(() => CloudSync.login('a@example.com'), /auth failed/);
  assert.equal(JSON.parse(localStorage.getItem(key))[0].note, 'new', 'auth failure must not clear local data');

  localStorage.setItem(pendingKey, '[]');
  CloudSync._setTestState({error:'', flushing:false});
  for (const fn of windowHandlers.focus || []) fn();
  await new Promise(r => setTimeout(r, 320));
  assert.ok(fromCalls >= 3, 'focus should trigger a three-table pull');

  // Regression: a local record that disappeared before it ever received a cloud revision
  // must not poison the whole queue with sync_soft_delete_record(expectedRevision=0).
  localStorage.setItem(pendingKey, JSON.stringify([
    { ownerId:'owner-a', type:'work_tasks', id:'wt_transient', op:'delete', expectedRevision:0, mutationId:'m_absent', payload:null, queuedAt:Date.now() }
  ]));
  let absentRpcCalls = 0;
  CloudSync._setTestState({
    client:queryClient(null, async () => { absentRpcCalls++; return {data:null,error:new Error('delete RPC must not run for an absent row')}; }),
    session:{user:{id:'owner-a',email:'a@example.com'}}, initialized:true, error:'', flushing:false
  });
  await CloudSync.flushPending();
  assert.equal(JSON.parse(localStorage.getItem(pendingKey)).length, 0, 'absent cloud row should safely acknowledge the zero-revision delete');
  assert.equal(absentRpcCalls, 0, 'zero-revision delete must probe cloud before calling delete RPC');

  // If the cloud row exists, recover its real revision and then soft-delete with optimistic locking.
  localStorage.setItem(pendingKey, JSON.stringify([
    { ownerId:'owner-a', type:'work_tasks', id:'wt_existing', op:'delete', expectedRevision:0, mutationId:'m_existing', payload:null, queuedAt:Date.now() }
  ]));
  let recoveredDeleteArgs = null;
  CloudSync._setTestState({
    client:queryClient(
      { id:'wt_existing', payload:{id:'wt_existing',title:'old'}, revision:4, updated_at:'2026-08-28T06:00:00Z', deleted_at:null },
      async (fn, args) => {
        assert.equal(fn, 'sync_soft_delete_record');
        recoveredDeleteArgs = args;
        return {data:{status:'ok',record:{id:'wt_existing',payload:{id:'wt_existing',title:'old'},revision:5,updated_at:'2026-08-28T06:01:00Z',deleted_at:'2026-08-28T06:01:00Z'}},error:null};
      }
    ),
    session:{user:{id:'owner-a',email:'a@example.com'}}, initialized:true, error:'', flushing:false
  });
  await CloudSync.flushPending();
  assert.equal(recoveredDeleteArgs.p_expected_revision, 4, 'delete recovery must use the cloud row real revision');
  assert.equal(JSON.parse(localStorage.getItem(pendingKey)).length, 0, 'recovered delete should leave no poison pending item');
  const recoveredMeta = JSON.parse(localStorage.getItem(metaKey));
  assert.equal(recoveredMeta.revisions.work_tasks.wt_existing, 5, 'successful recovered delete should advance the known revision');

  CloudSync._setTestState({session:null, initialized:false});
  CloudSync._snapshotStores();
  const signedOutChange = [{id:'u_1', number:'强化2群', note:'signed-out edit'}];
  localStorage.setItem(key, JSON.stringify(signedOutChange));
  CloudSync.observeStoreWrite('customers', signedOutChange);
  assert.equal(JSON.parse(localStorage.getItem(pendingKey) || '[]').length, 0, 'signed-out edits must not become cloud pending work');

  console.log('cloud sync adapter tests OK');
})().catch(err => { console.error(err); process.exit(1); });
