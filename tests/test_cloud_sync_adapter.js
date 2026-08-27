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

(async () => {
  const key = 'sales_followup_data_v3';
  const pendingKey = 'sales_cloud_pending_v1';
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

  CloudSync._setTestState({session:null, initialized:false});
  CloudSync._snapshotStores();
  const signedOutChange = [{id:'u_1', number:'强化2群', note:'signed-out edit'}];
  localStorage.setItem(key, JSON.stringify(signedOutChange));
  CloudSync.observeStoreWrite('customers', signedOutChange);
  assert.equal(JSON.parse(localStorage.getItem(pendingKey) || '[]').length, 0, 'signed-out edits must not become cloud pending work');

  console.log('cloud sync adapter tests OK');
})().catch(err => { console.error(err); process.exit(1); });
