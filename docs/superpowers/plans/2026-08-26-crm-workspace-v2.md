# CRM Workspace v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有五列客户墙升级为“左侧导航 + 今日作战台 + 多子页面 + 右侧客户抽屉”的个人销售 CRM，同时新增可关联客户的今日/明日任务系统，并保持现有客户数据完全兼容。

**Architecture:** 保留现有 `index.html` 作为客户数据与既有业务函数的兼容层；新增 `assets/workspace-v2-core.js` 承担无 DOM 的路由、任务状态与筛选逻辑，新增 `assets/workspace-v2.js` 负责 DOM 壳层、页面渲染与旧函数桥接，新增 `assets/workspace-v2.css` 负责 Modern Comic Ops 视觉覆盖。旧 `sales_followup_data_v3` 与 `sales_tags_v1` 不迁移，新任务单独使用 `sales_work_tasks_v1`。

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript, localStorage, Node.js 22 contract/unit tests, Python 3.12 static UI contract tests, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-26-crm-workspace-v2-design.md`

## Global Constraints

- 不破坏现有客户、编号、栏目、标签、备注、跟进历史、下次跟进时间、有效沟通统计。
- 保留 localStorage key `sales_followup_data_v3` 与 `sales_tags_v1` 的读取和写入语义。
- 新任务只写入 `sales_work_tasks_v1`。
- hash 路由固定为 `#home`、`#tasks`、`#board`、`#search`、`#analytics`、`#batch`。
- 左侧导航默认展开约 220–240px，折叠后约 64px。
- 主要面向电脑端；1366×768 必须可用，1920×1080 不得无限拉伸信息密度。
- 不引入框架、后端、登录、云同步、微信读取、周期任务或复杂通知系统。
- 旧五阶段看板、拖拽、批量操作、导入导出、备份恢复必须继续可用。

---

### Task 1: 建立 Workspace v2 核心逻辑与回归契约

**Files:**
- Create: `assets/workspace-v2-core.js`
- Create: `tests/test_workspace_v2_core.js`
- Create: `tests/test_workspace_v2_contract.py`
- Modify: `.github/workflows/ui-contract.yml`

**Interfaces:**
- Produces: `WorkspaceV2Core.normalizeRoute(hash) -> string`
- Produces: `WorkspaceV2Core.normalizeTask(task) -> Task`
- Produces: `WorkspaceV2Core.createTask(input, now) -> Task`
- Produces: `WorkspaceV2Core.getRolloverCandidates(tasks, today) -> Task[]`
- Produces: `WorkspaceV2Core.activateTasks(tasks, ids, now) -> Task[]`
- Produces: `WorkspaceV2Core.deferTasks(tasks, ids, now) -> Task[]`
- Produces: `WorkspaceV2Core.sortTasks(tasks) -> Task[]`

- [ ] **Step 1: 写失败的 Node 单元测试**

```js
const assert = require('assert');
const core = require('../assets/workspace-v2-core.js');

assert.equal(core.normalizeRoute(''), 'home');
assert.equal(core.normalizeRoute('#board'), 'board');
assert.equal(core.normalizeRoute('#unknown'), 'home');

const task = core.createTask({
  title: '回访 #2877',
  plannedDate: '2026-08-27',
  priority: 'important',
  linkedCustomerId: 'u_2877',
  status: 'planned'
}, 1000);
assert.equal(task.status, 'planned');
assert.equal(task.linkedCustomerId, 'u_2877');

const due = core.getRolloverCandidates([task], '2026-08-27');
assert.equal(due.length, 1);

const active = core.activateTasks([task], [task.id], 2000);
assert.equal(active[0].status, 'active');
assert.equal(active[0].activatedAt, 2000);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node tests/test_workspace_v2_core.js`
Expected: FAIL because `assets/workspace-v2-core.js` does not exist.

- [ ] **Step 3: 实现纯逻辑核心**

Use a UMD-style export so the same file works in browser and Node:

```js
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WorkspaceV2Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const ROUTES = new Set(['home','tasks','board','search','analytics','batch']);
  function normalizeRoute(hash) {
    const value = String(hash || '').replace(/^#/, '');
    return ROUTES.has(value) ? value : 'home';
  }
  // task helpers implemented with immutable array returns
  return { normalizeRoute, normalizeTask, createTask, getRolloverCandidates, activateTasks, deferTasks, sortTasks };
});
```

- [ ] **Step 4: 写静态 UI contract**

`tests/test_workspace_v2_contract.py` must assert:

```python
from pathlib import Path
html = Path('index.html').read_text(encoding='utf-8')
assert "sales_followup_data_v3" in html
assert "sales_tags_v1" in html
assert 'assets/workspace-v2.css' in html
assert 'assets/workspace-v2-core.js' in html
assert 'assets/workspace-v2.js' in html
core = Path('assets/workspace-v2-core.js').read_text(encoding='utf-8')
app = Path('assets/workspace-v2.js').read_text(encoding='utf-8')
assert "sales_work_tasks_v1" in app
assert "#home" in app or "home" in app
assert "#board" in app or "board" in app
```

- [ ] **Step 5: 更新 Actions 执行三套检查**

Workflow commands:

```yaml
- run: python tests/test_ui_contract.py
- run: python tests/test_workspace_v2_contract.py
- run: node tests/test_workspace_v2_core.js
```

并把 push branch 改为 `design/crm-workspace-v2`。

- [ ] **Step 6: 运行全部测试并提交**

Run:
`python tests/test_ui_contract.py && python tests/test_workspace_v2_contract.py && node tests/test_workspace_v2_core.js`
Expected: PASS.

Commit: `test: add workspace v2 core contracts`

---

### Task 2: 建立左侧导航、应用壳与 hash 子页面

**Files:**
- Create: `assets/workspace-v2.css`
- Create: `assets/workspace-v2.js`
- Modify: `index.html`
- Test: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Consumes: existing globals `users`, `tags`, `COLUMNS`, `render()`, `openTagModal()`, `setTaskFilter()`, `exportData()`, `backupData()`, `restoreData()`.
- Produces: `WorkspaceV2.navigate(route)`, `WorkspaceV2.renderCurrentView()`, `WorkspaceV2.toggleSidebar()`.

- [ ] **Step 1: 扩展 contract，先要求壳层 token**

Assert app script contains `workspace-shell`, `workspace-sidebar`, `workspace-main`, route names, and sidebar collapsed storage key `sales_workspace_sidebar_v1`.

- [ ] **Step 2: 运行 contract 确认失败**

Run: `python tests/test_workspace_v2_contract.py`
Expected: FAIL on missing shell tokens.

- [ ] **Step 3: 修改 `index.html` 只做资源接入**

Before `</head>` add:

```html
<link rel="stylesheet" href="assets/workspace-v2.css">
```

After the existing inline `</script>` and before `</body>` add:

```html
<script src="assets/workspace-v2-core.js"></script>
<script src="assets/workspace-v2.js"></script>
```

Do not rename or remove existing element IDs.

- [ ] **Step 4: `workspace-v2.js` 在启动后重组 DOM**

Create one shell and move the existing `.header`, `#taskBar`, `#tagFilterBar`, `#board` into a `data-view="board"` container instead of cloning them. Create sibling containers for home/tasks/search/analytics/batch. Build a fixed sidebar with six route buttons and a collapse button. Use `hashchange` and default empty hash to `#home`.

- [ ] **Step 5: `workspace-v2.css` 建立 Modern Comic Ops 基础视觉**

Use dark ink sidebar, warm paper main background, subtle halftone pseudo-element, medium 1–2px borders, limited status colors, max content width around 1680px. Sidebar transitions must be 160–200ms. Existing manga image may appear only as a low-contrast brand strip.

- [ ] **Step 6: 路由与折叠状态验证**

Run syntax checks:
`node --check assets/workspace-v2-core.js && node --check assets/workspace-v2.js`
Run all tests. Expected: PASS.

Commit: `feat: add workspace shell and navigation`

---

### Task 3: 实现今日/明日任务系统与昨日转入流程

**Files:**
- Modify: `assets/workspace-v2-core.js`
- Modify: `assets/workspace-v2.js`
- Modify: `assets/workspace-v2.css`
- Modify: `tests/test_workspace_v2_core.js`

**Interfaces:**
- Storage key: `sales_work_tasks_v1`
- UI functions: `loadWorkTasks()`, `saveWorkTasks()`, `addWorkTask(mode)`, `updateWorkTask(id, patch)`, `completeWorkTask(id)`, `deleteWorkTask(id)`, `renderHome()`.

- [ ] **Step 1: 扩展任务核心测试**

Cover `planned -> active`, `planned -> deferred`, completed exclusion from rollover, priority sort `urgent > important > normal`, stable `sortOrder`, and invalid stored objects normalized safely.

- [ ] **Step 2: 运行 Node 测试确认新增断言失败**

Run: `node tests/test_workspace_v2_core.js`
Expected: FAIL until new task helpers are complete.

- [ ] **Step 3: 实现 localStorage 任务仓库**

`workspace-v2.js` loads an array from `sales_work_tasks_v1`; parse errors fall back to `[]` without touching customer storage. Every mutation saves immediately.

- [ ] **Step 4: 实现“今日计划”主卡**

Support add/edit/delete/check, priority selector, linked customer selector/search, completed group collapsed by default. Task row customer chip calls existing `openTagModal(linkedCustomerId)`.

- [ ] **Step 5: 实现“明日计划”与转入提示**

Tomorrow creation uses `status:'planned'`. On `#home`, call `getRolloverCandidates`. Render banner actions: 全部转入、选择转入、暂不处理. Selection modal/list uses checkboxes; defer marks `deferred` rather than deleting.

- [ ] **Step 6: 实现拖拽排序**

Only reorder within the same visible task group; update `sortOrder`; no cross-status drag in v1.

- [ ] **Step 7: 运行测试并提交**

Run all Python/Node tests and syntax checks.
Commit: `feat: add daily planning task system`

---

### Task 4: 实现首页 CRM 雷达、最近客户与统一客户抽屉

**Files:**
- Modify: `assets/workspace-v2.js`
- Modify: `assets/workspace-v2.css`
- Modify: `index.html`
- Test: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Consumes existing `getFollowupStatus(u)`, `countEffectiveToday()`, `COLUMNS`, `openTagModal(userId)`.
- Produces: `renderCrmRadar()`, `trackRecentCustomer(userId)`, `renderRecentCustomers()`.

- [ ] **Step 1: 写 contract 要求 CRM radar 与 drawer classes**

Require `crm-radar`, `recent-customers`, `customer-drawer`, and no regression of `id="tagModal"` / detail field IDs.

- [ ] **Step 2: 实现 CRM 雷达**

Calculate overdue/today/high-intent/effective counts from existing `users`. Radar buttons navigate to `#tasks` and set the appropriate filter; high-intent opens tasks page with stage filter `contacting`.

- [ ] **Step 3: 实现最近客户**

Wrap `openTagModal` once after legacy initialization: call original behavior then store at most 5 IDs in `sales_recent_customers_v1`. Missing/deleted IDs are filtered at render time.

- [ ] **Step 4: 把 `#tagModal` 从 centered modal 视觉改为右侧抽屉**

Keep its markup and IDs to preserve old functions. CSS changes overlay alignment to right, `.detail-modal` width `clamp(360px, 32vw, 430px)`, full viewport height, square/right-edge layout, slide transform, backdrop lighter than old modal. `closeTagModal()` continues to work unchanged.

- [ ] **Step 5: 运行 regression 并提交**

Run all tests.
Commit: `feat: add crm radar and customer drawer`

---

### Task 5: 实现今日任务、客户搜索与看板子页面

**Files:**
- Modify: `assets/workspace-v2.js`
- Modify: `assets/workspace-v2.css`
- Test: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Produces: `renderTasksView()`, `renderSearchView()`, `showCustomerFromList(id)`.
- Reuses existing board DOM and render/filter functions.

- [ ] **Step 1: 今日任务页**

Render four sections: 逾期、今日、即将到期、未安排. Each row shows customer number, stage, tags, next action, follow-up time. Add stage/tag filters. Clicking a row opens the shared drawer.

- [ ] **Step 2: 客户搜索页**

Search number, note and tag name against existing arrays. Empty query shows recent customers rather than all users. Results capped initially at 80 with count summary.

- [ ] **Step 3: 客户看板页兼容**

Move the existing header/task filter/tag filter/board into the `#board` child view. Preserve five columns, drag/drop, three-card grid, batch selection and existing menus. Do not duplicate users into new storage.

- [ ] **Step 4: 测试并提交**

Run all tests and syntax checks.
Commit: `feat: add tasks search and board views`

---

### Task 6: 实现数据统计与批量运营子页面

**Files:**
- Modify: `assets/workspace-v2.js`
- Modify: `assets/workspace-v2.css`
- Modify: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Produces: `renderAnalyticsView()`, `renderBatchView()`.
- Reuses existing `toggleBatchMode()`, `showBatchAdd()`, `exportData()`, `backupData()`, `importFile(event)`, `restoreData(event)`.

- [ ] **Step 1: 数据统计页 MVP**

Without chart libraries, render CSS bar/line-like summaries for: effective today, stage counts, overdue/today follow-ups, high-intent count, completed personal tasks. Keep charts readable rather than game-like.

- [ ] **Step 2: 批量运营页**

Provide action cards/buttons that call the existing batch/tag/import/export/backup/restore workflows. For file actions, use page-local hidden inputs wired to `importFile` and `restoreData`.

- [ ] **Step 3: 保持旧菜单可用**

Do not remove old `toolsMenu`; batch page is an additional organized entry point, not a breaking replacement.

- [ ] **Step 4: 测试并提交**

Run all tests.
Commit: `feat: add analytics and batch operations views`

---

### Task 7: 视觉收口、电脑端响应式与最终回归

**Files:**
- Modify: `assets/workspace-v2.css`
- Modify: `assets/workspace-v2.js`
- Modify: `tests/test_workspace_v2_contract.py`
- Modify: `.github/workflows/ui-contract.yml`

**Interfaces:**
- No new storage contracts.
- Final UI must satisfy design success criteria 1–10.

- [ ] **Step 1: 1366 / 1440 / 1920 CSS checkpoints**

At <= 1400px reduce sidebar/card padding, keep drawer <= 400px; at >= 1800px center main content with max width; below 900px allow collapsed sidebar by default only if needed for fit, but desktop preference remains stored.

- [ ] **Step 2: 加入微动效与像素/漫画细节**

Use 100–200ms task-complete tick, subtle halftone backgrounds, pixel-like 2px accent blocks and consistent icon boxes. No full-page manga background, blinking or pixel body font.

- [ ] **Step 3: 最终 contract 加固**

Verify legacy storage keys/functions, new task key, six routes, drawer token, sidebar token, task rollover helpers and JS syntax.

- [ ] **Step 4: 最终执行**

Run:

```bash
python tests/test_ui_contract.py
python tests/test_workspace_v2_contract.py
node tests/test_workspace_v2_core.js
node --check assets/workspace-v2-core.js
node --check assets/workspace-v2.js
```

Expected: all PASS.

- [ ] **Step 5: 提交最终收口**

Commit: `style: finish modern comic crm workspace`

- [ ] **Step 6: 创建 PR 前比较 main**

Use GitHub compare `main...design/crm-workspace-v2`; confirm customer seed data and storage keys are unchanged, and changed files are limited to the planned UI/core/test/docs/workflow set.
