# CRM 高密度工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单页 CRM 重构为适合 1366×768 / 1440×900 笔记本长期使用的高密度销售工作台，同时保持所有现有业务数据与存储兼容。

**Architecture:** 保留现有 `index.html` 单文件架构与业务函数，只重排 HTML/CSS 与少量渲染函数。数据层继续使用既有 `sales_followup_data_v3`、`sales_tags_v1` localStorage key；看板、任务筛选、拖拽、批量操作、标签、跟进记录函数保持原语义。新增轻量静态回归测试，验证关键 DOM/CSS/存储契约与脚本语法。

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript, Python 3 stdlib contract tests, Node.js syntax check, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-crm-ui-workbench-design.md`

## Global Constraints

- 不改用户数据结构、标签数据、备注、跟进历史、栏目字段。
- 不改 localStorage key：`sales_followup_data_v3` 与 `sales_tags_v1`。
- 不改现有导入/导出数据语义。
- 不引入前端框架、后端、账号系统或云同步。
- 所有栏目统一一行 3 卡。
- 主要优化 1366×768 与 1440×900；移动端只保证可用。
- 顶部主要工作区目标不超过约 100px。
- 现有菜单、搜索、标签筛选、栏目筛选、拖拽、批量操作、跟进记录、KPI 必须保留。

---

### Task 1: 建立 UI 与数据兼容回归契约

**Files:**
- Create: `tests/test_ui_contract.py`
- Create: `.github/workflows/ui-contract.yml`
- Read/Verify: `index.html`

**Interfaces:**
- Consumes: 当前 `index.html` DOM/CSS/JS 文本。
- Produces: 一个零第三方依赖的静态回归脚本，后续每次 UI 修改都可验证存储 key、功能函数、三卡布局、顶部结构和详情核心控件。

- [ ] **Step 1: 写测试脚本，先覆盖不允许回归的契约**

```python
from pathlib import Path
import re
import subprocess
import tempfile

html = Path('index.html').read_text(encoding='utf-8')

required = [
    "const STORAGE_KEY = 'sales_followup_data_v3'",
    "const TAGS_KEY = 'sales_tags_v1'",
    'id="toolsMenuBtn"',
    'id="taskBar"',
    'id="board"',
    'id="detailResult"',
    'id="detailNextTime"',
    'id="detailNextAction"',
    'function onDrop(',
    'function batchMoveSelected(',
    'function logFollowup(',
    'function renderTagModal(',
]
for token in required:
    assert token in html, token

assert re.search(r'\.column-body\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)', html, re.S)
assert 'class="stats-bar"' not in html
assert 'data-followup-status=' in html

script = re.search(r'<script>(.*)</script>', html, re.S).group(1)
with tempfile.NamedTemporaryFile('w', suffix='.js', encoding='utf-8', delete=False) as f:
    f.write(script)
    name = f.name
subprocess.run(['node', '--check', name], check=True)
print('UI contract OK')
```

- [ ] **Step 2: 运行测试，确认当前版本至少在新三卡/顶部结构断言上失败**

Run: `python tests/test_ui_contract.py`
Expected: FAIL，因为当前普通栏目仍为两卡、仍存在独立统计栏、卡片还没有统一状态属性。

- [ ] **Step 3: 添加 GitHub Actions 工作流**

```yaml
name: UI contract
on:
  push:
    branches: [design/crm-ui-workbench]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: python tests/test_ui_contract.py
```

- [ ] **Step 4: Commit**

```bash
git add tests/test_ui_contract.py .github/workflows/ui-contract.yml
git commit -m "test: lock CRM UI and storage contracts"
```

### Task 2: 重构顶部工作区与视觉基础

**Files:**
- Modify: `index.html` 的 `<style>` 与顶部 `<body>` 结构
- Test: `tests/test_ui_contract.py`

**Interfaces:**
- Consumes: 现有 `renderTaskBar()`、搜索、添加、菜单函数。
- Produces: 两层顶部工作区：主栏 + 任务栏；删除独立统计栏视觉层，但栏目数量仍由 `count-*` 显示。

- [ ] **Step 1: 将页面视觉变量改为工具型浅色系统，并弱化漫画背景**

设置：页面浅灰基底、白色卡片、蓝色主操作、细边框、轻阴影；`manga-bg.jpg` 通过更高白色遮罩降低对比度。

- [ ] **Step 2: 将 `.header` 高度压缩到约 54px，扩大搜索框并保留菜单**

主栏保持 sticky；在 1366px 宽度不换行，搜索与单用户添加仍可直接操作。

- [ ] **Step 3: 删除 `<div class="stats-bar" id="statsBar"></div>`，并停止 `render()` 调用 `renderStats()`**

保留 `renderStats()` 函数也可以，但不再依赖对应 DOM；优先直接删除函数避免无效代码。

- [ ] **Step 4: 将 `.task-bar` 调整为紧贴顶部的第二层，顶部两层总高度控制在约 96px**

任务顺序固定为：全部 / 今日 / 逾期 / 未来 / 未安排；KPI 靠右。

- [ ] **Step 5: 运行静态检查**

Run: `python tests/test_ui_contract.py`
Expected: 仍可能因三卡/卡片状态未实现而 FAIL，但不应出现顶部菜单、存储 key、脚本语法相关失败。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: compress CRM workspace header"
```

### Task 3: 重构看板与三卡高密度卡片

**Files:**
- Modify: `index.html` 的看板 CSS、`renderColumns()`、`renderCard()`、`renderCardFollowup()`
- Test: `tests/test_ui_contract.py`

**Interfaces:**
- Consumes: `getFollowupStatus(user) -> overdue|today|future|unscheduled`、`filterByTag()`、拖拽函数、批量选择函数。
- Produces: 所有栏目统一三卡一行；卡片只呈现编号、标签点、跟进状态、下一步动作。

- [ ] **Step 1: 将 `.column` 宽度设为约 372px，并将 `.column-body` 统一为三列**

```css
.column { flex: 0 0 372px; }
.column-body {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
```

删除 `pending` 专属三列规则，`show-more-btn` 与 `empty-state` 保持跨全列。

- [ ] **Step 2: 精简卡片样式**

卡片高度保持紧凑，圆角约 8px；标签仅显示色点；不再显示更新时间和“🏷”图标；下一步动作单行省略。

- [ ] **Step 3: 给卡片输出统一状态属性与类**

`renderCard(u)` 先计算：

```js
const followupStatus = getFollowupStatus(u);
```

根节点加入：

```html
data-followup-status="${followupStatus}"
```

并通过 `status-overdue/status-today/status-future/status-unscheduled` 控制左侧细强调条。

- [ ] **Step 4: 将状态文案简化**

- overdue：`已逾期`
- today：`今日跟进`
- future：`下次 M/D`
- unscheduled：存在下一步时显示 `未安排时间`，否则不制造强视觉噪音

下一步动作单独一行，不再拼接“下一步：”。

- [ ] **Step 5: 调整紧凑视图语义**

紧凑视图仍保留开关，但只进一步缩小栏目间距、卡片内边距和字体，不改变三卡结构。

- [ ] **Step 6: 运行测试**

Run: `python tests/test_ui_contract.py`
Expected: 三卡与 `data-followup-status` 断言通过；如果详情结构尚未重排，现有核心详情控件仍必须存在。

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: rebuild board as dense three-card columns"
```

### Task 4: 重排学员详情为高频动作优先

**Files:**
- Modify: `index.html` 的 `tagModal` HTML、详情 CSS、`openTagModal()`、`renderTagModal()`
- Test: `tests/test_ui_contract.py`

**Interfaces:**
- Consumes: 现有 DOM id：`detailNote`, `detailResult`, `detailNextTime`, `detailNextAction`, `followupHistory`, `currentTags`, `allTags`, `newTagName`。
- Produces: 不改变这些 id 和写入函数的详情布局；新增摘要区域只读展示当前栏目与标签。

- [ ] **Step 1: 将详情弹窗扩大到约 760px 宽，保持 `max-height: 88vh` 与内部滚动**

1366×768 下弹窗宽度不超过视口；桌面使用双列/分区布局，移动端回落单列。

- [ ] **Step 2: 新增详情顶部摘要**

结构包含：学员编号、栏目 badge、当前标签摘要、关闭按钮。新增只读容器：`detailColumnBadge`、`detailTagSummary`。

- [ ] **Step 3: 将“本次沟通结果 & 下一步”移动到第一块并压缩高度**

第一屏能直接完成：结果、下次时间、快捷时间、下一步动作、记录按钮。移除已过期的固定“25号直播后”快捷时间，仅保留明天 / 3天后 / 7天后 / 清空。

- [ ] **Step 4: 历史区放在第二优先级，默认最多显示 5 条**

修改 `renderFollowupHistory()` 的 `slice(0,8)` 为 `slice(0,5)`；容器自身可滚动。

- [ ] **Step 5: 将备注与标签管理下沉到“资料”区**

所有原有 id 与操作按钮保留，确保 `saveDetailNote()`、标签编辑删除、`detailMoveLow()`、`detailDelete()` 无需改变数据语义。

- [ ] **Step 6: 在 `renderTagModal()` 中刷新顶部摘要**

```js
const col = COLUMNS.find(c => c.id === user.column);
document.getElementById('detailColumnBadge').textContent = col?.name || user.column;
```

标签摘要使用现有 `getTag()` 读取，不写数据。

- [ ] **Step 7: 运行测试**

Run: `python tests/test_ui_contract.py`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: prioritize follow-up actions in student detail"
```

### Task 5: 笔记本适配与交互回归

**Files:**
- Modify: `index.html` 响应式 CSS 与少量无数据语义交互
- Test: `tests/test_ui_contract.py`

**Interfaces:**
- Consumes: 前四个任务完成后的 DOM 与样式。
- Produces: 1366×768 / 1440×900 优先布局；移动端可用；横向看板滚动清晰。

- [ ] **Step 1: 添加 1366/1440 目标样式检查点**

在桌面宽度下：顶部不换行、栏目固定约 372px、三卡布局稳定、任务栏不遮挡看板。

- [ ] **Step 2: 为 ≤900px 做可用回退**

主栏允许换行；详情单列；栏目适当缩窄但仍保持三卡，必要时卡片字号缩小。

- [ ] **Step 3: 优化横向滚动条与 hover**

滚动条使用中性浅灰；hover 仅轻微提升，避免大面积阴影。

- [ ] **Step 4: 核对所有原功能入口仍存在**

检查菜单中的批量选择、批量添加、紧凑视图、导出、备份、导入、恢复；检查栏目筛选和标签筛选。

- [ ] **Step 5: 运行完整静态检查**

Run: `python tests/test_ui_contract.py`
Expected: PASS + Node syntax check PASS。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "fix: polish laptop layout and preserve CRM interactions"
```

### Task 6: 最终验证、PR 与合并

**Files:**
- Verify: `index.html`
- Verify: `tests/test_ui_contract.py`
- Verify: `.github/workflows/ui-contract.yml`

**Interfaces:**
- Produces: 可合并到 `main` 的 UI 重构版本。

- [ ] **Step 1: 检查数据契约未变化**

确认 `STORAGE_KEY`、`TAGS_KEY` 原值不变，`saveData()` / `saveTags()` 仍直接序列化现有数组。

- [ ] **Step 2: 检查 diff 范围**

允许修改：HTML/CSS/渲染展示函数与测试；不允许删除业务字段或改变导入导出语义。

- [ ] **Step 3: 确认 GitHub Actions 成功**

Expected: `UI contract` conclusion = `success`。

- [ ] **Step 4: 创建 PR**

Title: `重构 CRM 高密度销售工作台 UI`

Body 应说明：三卡布局、顶部压缩、卡片信息优先级、详情重排、数据兼容边界、验证结果。

- [ ] **Step 5: 合并 PR 到 main**

仅在 PR 可合并且 CI 成功后合并。
