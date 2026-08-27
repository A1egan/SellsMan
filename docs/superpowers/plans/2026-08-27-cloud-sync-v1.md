# Cloud Sync v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-account, multi-device Supabase cloud sync to the existing static CRM without breaking the current local-first UI or localStorage compatibility.

**Architecture:** Keep the existing `users`, `tags`, and Workspace v2 task state as the UI-facing model. Add a focused cloud-sync core for revision/pending/meta semantics plus a browser adapter for Supabase Auth, pull/push, migration, conflict UI, and sync status. PostgreSQL RPC functions provide atomic revision-checked writes and tombstones; localStorage remains the immediate write path and offline cache.

**Tech Stack:** Static HTML/CSS/vanilla JS, Supabase Auth + PostgreSQL/RLS/RPC, Node-based unit tests, existing Python/browser contract tests, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-27-cloud-sync-v1-design.md`

## Global Constraints

- Single account only; no teams, roles, shared workspaces, or Realtime.
- Magic Link email authentication.
- Existing localStorage keys remain compatible: `sales_followup_data_v3`, `sales_tags_v1`, `sales_work_tasks_v1`.
- New internal keys: `sales_cloud_sync_meta_v1`, `sales_cloud_pending_v1`.
- `localStorage` is always written before any network request; cloud failure must never clear local data.
- Conflict winner is determined only by `revision`, never by device clock.
- Normal deletes are tombstones (`deleted_at` + revision increment), not hard deletes.
- The latest uploaded version-2 JSON exported at `2026-08-27T02:02:10.150Z` is the only initialization baseline: 1060 customers, 10 tags, zero work tasks.
- Never commit that customer backup or derived customer payloads to the public GitHub repository; migration data is supplied only at initialization/runtime or directly to the authenticated database.
- Preserve string semantics for customer `number`; six values are non-numeric.
- Existing customer board, drag/drop, tags, search, analytics and Workspace v2 task UI must continue to pass their current tests.

---

### Task 1: Database schema, RLS, and atomic sync RPCs

**Files:**
- Create: `supabase/migrations/2026082701_cloud_sync_v1.sql`
- Test: database assertions executed against the connected Supabase project after migration

**Interfaces:**
- Produces tables: `customers`, `tags`, `work_tasks`, `sync_state`
- Produces RPC: `sync_upsert_record(p_record_type text, p_record_id text, p_payload jsonb, p_expected_revision bigint)`
- Produces RPC: `sync_soft_delete_record(p_record_type text, p_record_id text, p_expected_revision bigint)`
- Produces RPC: `sync_initialize_record(p_record_type text, p_record_id text, p_payload jsonb)` for idempotent first migration only
- All functions derive owner from `auth.uid()`; none accept `owner_id` from the client

- [ ] **Step 1: Write the migration SQL with tables and constraints**

```sql
create table if not exists public.customers (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id)
);

create table if not exists public.tags (like public.customers including defaults including constraints);
create table if not exists public.work_tasks (like public.customers including defaults including constraints);

create table if not exists public.sync_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  initialized_at timestamptz not null default now(),
  schema_version integer not null default 1,
  last_server_change_at timestamptz
);
```

Use explicit primary keys/foreign keys for `tags` and `work_tasks` if `LIKE` does not reproduce them exactly in PostgreSQL.

- [ ] **Step 2: Add RLS policies**

```sql
alter table public.customers enable row level security;
create policy customers_owner_all on public.customers
for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
```

Repeat equivalent owner-only policies for `tags`, `work_tasks`, and `sync_state`.

- [ ] **Step 3: Add a record-type resolver and revision-checked RPCs**

Each RPC must reject unknown types and perform one SQL statement whose predicate includes both owner and expected revision. Successful upsert returns at least `{id, revision, updated_at, deleted_at}`; zero matched rows are surfaced as a conflict result rather than silently inserting over an existing row.

```sql
-- semantic contract for update path
update public.customers
set payload = p_payload,
    revision = revision + 1,
    updated_at = now(),
    deleted_at = null
where owner_id = auth.uid()
  and id = p_record_id
  and revision = p_expected_revision
returning id, revision, updated_at, deleted_at;
```

For `p_expected_revision = 0`, allow an insert only when `(owner_id,id)` does not exist. The delete RPC updates `deleted_at = now()` and increments revision under the same expected-revision predicate.

- [ ] **Step 4: Add idempotent initialization RPC**

`sync_initialize_record` inserts revision 1 for the authenticated owner and on conflict leaves an identical already-initialized row untouched. It must not be usable to overwrite a row once `sync_state` exists.

- [ ] **Step 5: Apply migration to the connected Supabase project and query the catalog**

Verify all four tables have RLS enabled and all expected policies/functions exist.

- [ ] **Step 6: Run security advisors**

Expected: no missing-RLS or public-write advisory for the new tables/functions.

- [ ] **Step 7: Commit migration**

```bash
git add supabase/migrations/2026082701_cloud_sync_v1.sql
git commit -m "feat: add cloud sync database contract"
```

---

### Task 2: Pure cloud-sync state core with TDD

**Files:**
- Create: `assets/cloud-sync-core.js`
- Create: `tests/test_cloud_sync_core.js`
- Modify: `.github/workflows/ui-contract.yml`

**Interfaces:**
- Produces `globalThis.CloudSyncCore`
- `normalizeMeta(raw, ownerId) -> {ownerId,revisions,lastPullAt,initializedSource}`
- `enqueuePending(queue, item) -> queue` where latest operation for `(type,id)` replaces stale duplicate work
- `ackPending(queue, type, id) -> queue`
- `knownRevision(meta, type, id) -> number`
- `setKnownRevision(meta, type, id, revision) -> meta`
- `applyRemoteRows(localRecords, rows) -> {records,tombstones}`
- `buildConflict(localPayload, remoteRow) -> conflict`

- [ ] **Step 1: Write failing unit tests**

Cover: revision map normalization, deduplicated pending queue, tombstones removing visible records, non-numeric `number` round trip, and conflict payload retaining both local and remote versions.

```js
assert.equal(core.knownRevision({revisions:{customers:{u_1:7}}}, 'customers', 'u_1'), 7);
const q = core.enqueuePending([], {type:'customers', id:'u_1', op:'upsert', expectedRevision:7});
assert.equal(q.length, 1);
```

- [ ] **Step 2: Run test and verify failure**

Run: `node tests/test_cloud_sync_core.js`
Expected: FAIL because `assets/cloud-sync-core.js` does not exist.

- [ ] **Step 3: Implement the minimal pure core**

Keep it DOM-free and Supabase-free so pending/revision semantics can be tested deterministically.

- [ ] **Step 4: Run test and verify pass**

Run: `node tests/test_cloud_sync_core.js`
Expected: PASS.

- [ ] **Step 5: Add the Node test to CI**

Add `node tests/test_cloud_sync_core.js` before browser probes.

- [ ] **Step 6: Commit**

```bash
git add assets/cloud-sync-core.js tests/test_cloud_sync_core.js .github/workflows/ui-contract.yml
git commit -m "feat: add cloud sync state core"
```

---

### Task 3: Browser adapter, Auth, local-first push/pull, and offline queue

**Files:**
- Create: `assets/cloud-sync.js`
- Create: `assets/cloud-sync.css`
- Create: `assets/cloud-sync-config.example.js`
- Modify: `index.html`
- Modify: `assets/workspace-v2.js`
- Create: `tests/cloud_sync_probe.html`
- Create: `tests/test_cloud_sync_browser.sh`

**Interfaces:**
- Produces `globalThis.CloudSync`
- `CloudSync.init()` initializes Supabase only when public config is present; missing config leaves the CRM in local-only mode
- `CloudSync.login(email)` sends Magic Link with redirect back to the GitHub Pages origin/path
- `CloudSync.logout()` signs out without clearing CRM local data
- `CloudSync.markDirty(type,id,op,payload)` persists pending before async push
- `CloudSync.pull(reason)` pulls remote rows including tombstones
- `CloudSync.flushPending()` uploads pending records sequentially or with bounded concurrency
- `CloudSync.manualSync()` runs pull + flush and updates status
- `CloudSync.getStatus()` returns UI state
- `CloudSync.onStatus(listener)` subscribes the topbar status UI

- [ ] **Step 1: Write browser contract probe with a fake Supabase client**

Probe must assert: localStorage changes happen before fake network resolution; a rejected network request leaves pending intact; focus/visibility trigger pull with debounce; an auth failure does not clear local records.

- [ ] **Step 2: Run probe and verify failure**

Run: `bash tests/test_cloud_sync_browser.sh`
Expected: FAIL because CloudSync is absent.

- [ ] **Step 3: Add config-safe Supabase bootstrap**

`assets/cloud-sync-config.example.js` documents only:

```js
window.CLOUD_SYNC_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  publishableKey: 'sb_publishable_...'
};
```

Production HTML must not contain a service-role key. If the real config is placed in the public app, only URL + publishable key are allowed.

- [ ] **Step 4: Implement auth and local storage accessors**

Use existing keys for CRM payload and new keys for meta/pending. Never call `localStorage.clear()`.

- [ ] **Step 5: Implement `markDirty` and `flushPending`**

`markDirty` writes the pending queue synchronously, emits status, then schedules async upload. On success, acknowledge queue item and store returned revision. On network/auth failure, retain queue. On revision conflict, remove that item from retry flow and store it in the conflict queue/state.

- [ ] **Step 6: Implement incremental pull**

Fetch all three tables with `updated_at > lastPullAt`, including rows where `deleted_at` is not null. Apply remote payloads to existing local arrays and keep tombstone revision metadata. Set `lastPullAt` from server-observed timestamps only after a successful pull.

- [ ] **Step 7: Hook existing saves without blocking UI**

Wrap or call CloudSync after existing synchronous `saveData()`, `saveTags()`, and Workspace `saveWorkTasks()` behavior. Customer drag/drop must still persist locally and render immediately before cloud I/O begins.

- [ ] **Step 8: Bind page-open/focus/visibility/manual sync triggers**

Debounce focus/visibility pulls to avoid duplicate requests within a short interval.

- [ ] **Step 9: Run new browser probe plus existing UI suites**

Run:
```bash
node tests/test_cloud_sync_core.js
bash tests/test_cloud_sync_browser.sh
bash tests/test_board_drag_runtime.sh
bash tests/test_board_five_column_runtime.sh
bash tests/test_workspace_v2_browser.sh
python tests/test_ui_contract.py
python tests/test_workspace_v2_contract.py
```
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add assets/cloud-sync.js assets/cloud-sync.css assets/cloud-sync-config.example.js index.html assets/workspace-v2.js tests/cloud_sync_probe.html tests/test_cloud_sync_browser.sh
git commit -m "feat: add local-first cloud sync adapter"
```

---

### Task 4: Login, initialization, status, and conflict UI

**Files:**
- Modify: `assets/workspace-v2.js`
- Modify: `assets/workspace-v2.css`
- Modify: `assets/cloud-sync.js`
- Modify: `tests/cloud_sync_probe.html`
- Modify: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Login modal sends Magic Link through `CloudSync.login(email)`
- Initialization modal consumes `{customerCount,tagCount,taskCount,exportedAt}` and calls `CloudSync.initializeFromBackup(payload)`
- Conflict modal calls `CloudSync.resolveConflict(conflictId, 'remote'|'local')`
- Status control invokes `CloudSync.manualSync()` and exposes login/logout actions

- [ ] **Step 1: Add failing DOM contract checks**

Assert copy/status states: `登录云同步`, `同步中…`, `已同步`, `离线 · N 项待同步`, `N 项冲突`; modal controls for Magic Link, initialization confirmation, diff view, keep-cloud, keep-local.

- [ ] **Step 2: Implement topbar sync control and modals**

Keep the status compact; do not displace quick search or the existing `+ 工作计划` action on desktop.

- [ ] **Step 3: Implement conflict resolution semantics**

Remote choice writes remote payload/tombstone to local cache and its revision to meta. Local choice first refreshes the latest remote revision, then explicitly retries the local payload against that latest revision. A second mismatch remains a conflict rather than force-overwriting.

- [ ] **Step 4: Run browser/UI tests**

Expected: cloud-sync contract plus all existing Workspace tests pass.

- [ ] **Step 5: Commit**

```bash
git add assets/workspace-v2.js assets/workspace-v2.css assets/cloud-sync.js tests/cloud_sync_probe.html tests/test_workspace_v2_contract.py
git commit -m "feat: add cloud sync account and conflict UI"
```

---

### Task 5: Version-2 initialization importer and version-3 backup compatibility

**Files:**
- Modify: `index.html`
- Modify: `assets/workspace-v2.js`
- Create: `tests/test_cloud_sync_backup.py`
- Create: `tests/fixtures/cloud-sync-v2-shape.json` containing synthetic, non-sensitive records only

**Interfaces:**
- `CloudSync.initializeFromBackup({app,version,exportedAt,users,tags,workTasks?})`
- Version 2 restore treats missing `workTasks` as `[]`
- Version 3 backup returns `{app,version:3,exportedAt,users,tags,workTasks}`

- [ ] **Step 1: Write failing backup tests with synthetic fixtures**

Test one numeric and one non-numeric customer number, nested history, tag references, and missing workTasks in v2. Do not copy real customer notes/IDs into fixtures.

- [ ] **Step 2: Update backup export to version 3**

`backupData()` includes current Workspace task store as `workTasks` while preserving users/tags.

- [ ] **Step 3: Update restore/import compatibility**

Version 2 remains accepted with empty tasks; version 3 restores tasks. Existing customer/tag behavior is unchanged.

- [ ] **Step 4: Implement safe initialization transaction flow**

Validate backup counts and shape client-side, initialize customers then tags then tasks using idempotent initialization RPC, and create `sync_state` only after every batch succeeds. If `sync_state` already exists, refuse initialization upload and pull cloud data instead.

- [ ] **Step 5: Validate the actual uploaded baseline outside the repository**

Before initialization, verify the selected private JSON reports exactly 1060 customers, 10 tags, zero work tasks, unique customer IDs, legal stage IDs, resolvable tag IDs, and preserves string `number` values. Do not commit the file.

- [ ] **Step 6: Run tests**

Run: `python tests/test_cloud_sync_backup.py` plus existing contract/browser suites.

- [ ] **Step 7: Commit**

```bash
git add index.html assets/workspace-v2.js tests/test_cloud_sync_backup.py tests/fixtures/cloud-sync-v2-shape.json
git commit -m "feat: add safe cloud initialization and v3 backups"
```

---

### Task 6: Real Supabase integration verification

**Files:**
- No customer-data files committed
- May update: `docs/superpowers/specs/2026-08-27-cloud-sync-v1-design.md` only if implementation discoveries require a documented correction

**Interfaces:**
- Requires an authenticated Magic Link user in the connected Supabase project
- Uses the browser public Project URL + publishable key

- [ ] **Step 1: Retrieve project URL and active publishable key**

Use only an active publishable/anon key. Never request or expose service-role credentials.

- [ ] **Step 2: Validate Magic Link redirect configuration**

Ensure the GitHub Pages site URL and callback path are allowed by Supabase Auth before relying on a real login test.

- [ ] **Step 3: Sign in with the account that will own the CRM**

After the user completes the Magic Link in their browser, verify an authenticated `auth.uid()` is present. Do not initialize data under an arbitrary temporary owner.

- [ ] **Step 4: Initialize from the private latest backup**

Run the importer using the private uploaded JSON and verify cloud counts are customers=1060, tags=10, work_tasks=0, sync_state=1 for that owner.

- [ ] **Step 5: Verify revision conflict with two sessions**

Both sessions load the same record/revision; session B updates first; session A update must return conflict and preserve B until explicit resolution.

- [ ] **Step 6: Verify tombstone behavior**

Delete in session A, pull in session B, confirm B removes the visible record and stores the tombstone revision; B must not resurrect it on the next flush.

- [ ] **Step 7: Verify RLS isolation at database level**

Using two authenticated test identities or policy simulation, confirm another `auth.uid()` cannot select/update the owner's rows.

- [ ] **Step 8: Run Supabase security/performance advisors**

Review any advisory introduced by this schema and fix security blockers before PR.

---

### Task 7: CI, regression verification, PR, and release gate

**Files:**
- Modify: `.github/workflows/ui-contract.yml` as needed to include new deterministic tests
- No direct merge to `main` in this task

**Interfaces:**
- PR target: `main`
- Feature branch: `feat/cloud-sync-v1`

- [ ] **Step 1: Run the complete deterministic suite**

```bash
python tests/test_ui_contract.py
python tests/test_workspace_v2_contract.py
python tests/test_workspace_v2_readability.py
node tests/test_workspace_v2_core.js
node tests/test_cloud_sync_core.js
python tests/test_cloud_sync_backup.py
bash tests/test_cloud_sync_browser.sh
bash tests/test_board_five_column_runtime.sh
bash tests/test_board_drag_runtime.sh
bash tests/test_tools_menu_layering.sh
bash tests/test_workspace_v2_browser.sh
```

Expected: all PASS.

- [ ] **Step 2: Inspect branch diff for secrets and private data**

Reject the release if the diff contains the uploaded customer JSON, email login tokens, service-role keys, or raw customer notes from the baseline backup.

- [ ] **Step 3: Open PR**

PR summary must explicitly state: local-first behavior, Magic Link, revision conflict protection, soft deletes, v3 backups, and no private seed data in Git.

- [ ] **Step 4: Wait for exact-head CI and inspect all jobs**

Only treat CI as valid when the successful workflow run SHA exactly matches the PR head SHA.

- [ ] **Step 5: Do not merge without explicit user authorization**

After CI and live/manual verification, present the PR and verification results. Merge only after the user explicitly says to merge.
