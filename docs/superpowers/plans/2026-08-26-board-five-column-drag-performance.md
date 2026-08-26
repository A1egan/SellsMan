# Five-Column Board + Drag Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer board show all five stages on a normal 1440px desktop without horizontal scrolling while eliminating the visible stutter/freeze during card dragging.

**Architecture:** Keep the existing legacy CRM engine and data model intact. Apply board-specific responsive CSS in `assets/workspace-v2.css`, and override only the legacy board drag handlers from `assets/workspace-v2.js` so dragging becomes a lightweight DOM operation instead of triggering expensive visual work. Preserve the legacy render path as an idle reconciliation fallback when filters are active.

**Tech Stack:** Static HTML/CSS/JavaScript, GitHub Pages, Python contract tests, Node syntax checks, headless Chrome smoke tests.

**Spec:** `docs/superpowers/specs/2026-08-26-crm-workspace-v2-design.md`

## Global Constraints

- Preserve `sales_followup_data_v3` and all existing customer/tag/follow-up semantics.
- Do not change CRM data when switching routes.
- Keep the customer board as the `#board` subpage, not the default home page.
- Desktop priority: 1440px should show all five board columns at once; wide screens should use the extra width rather than keeping fixed columns.
- Do not reduce text to unreadable sizes merely to force five columns.
- 1440-class widths use two cards per row; 1800px+ widths use three cards per row.
- Narrow widths fall back to horizontal board scrolling.
- Dragging must not invoke a full board render on every pointer movement.

---

### Task 1: Lock the board behavior with contract tests

**Files:**
- Modify: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Consumes: `assets/workspace-v2.css`, `assets/workspace-v2.js`
- Produces: regression assertions for five-column layout and optimized drag handlers

- [ ] **Step 1: Write the failing contract assertions**

Add assertions requiring: `repeat(5, minmax(0, 1fr))`, the 1800px three-card breakpoint, `board-drag-active`, `installBoardDragOptimizations`, `scheduleBoardReconcile`, and a drop path that updates the dragged DOM before any optional idle reconciliation.

- [ ] **Step 2: Run CI and verify RED**

Push the test-only commit to `design/crm-workspace-v2` and confirm the `UI contract` workflow fails because the new CSS/JS tokens do not exist yet.

- [ ] **Step 3: Commit**

Commit message: `test: cover board fit and drag performance`

### Task 2: Make the board fit five columns responsively

**Files:**
- Modify: `assets/workspace-v2.css`
- Test: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Consumes: existing `.workspace-view[data-view="board"]`, `.board`, `.column`, `.column-body`, `.card` markup
- Produces: five equal stage columns on normal desktop widths, 2-card density at 1440-class widths, 3-card density at 1800px+, horizontal fallback on narrow widths

- [ ] **Step 1: Add board-only responsive CSS**

Use a five-column CSS grid for the board, remove fixed legacy column widths inside the board route, clamp long card notes, and reduce only spacing/padding—not core text readability.

- [ ] **Step 2: Add wide-screen density rule**

At `min-width: 1800px`, switch all board column bodies to three card tracks.

- [ ] **Step 3: Add narrow fallback**

Below the usable-width threshold, restore a horizontally scrollable flex board with readable fixed columns.

- [ ] **Step 4: Run contract/browser tests**

Expected: layout contract assertions pass; existing workspace route/browser smoke checks remain green.

- [ ] **Step 5: Commit**

Commit message: `feat: fit five board stages on desktop`

### Task 3: Remove drag-time rendering and paint pressure

**Files:**
- Modify: `assets/workspace-v2.js`
- Modify: `assets/workspace-v2.css`
- Test: `tests/test_workspace_v2_contract.py`

**Interfaces:**
- Consumes: legacy globals `users`, `saveData`, `render`, `activeTagFilter`, `colFilters`, `taskFilter`, and legacy board DOM IDs `count-<column>`
- Produces: `installBoardDragOptimizations()`, `scheduleBoardReconcile()`, optimized global `onDragStart/onDragOver/onDragLeave/onDrop/onDragEnd`

- [ ] **Step 1: Override legacy drag handlers after the shell is built**

Track dragged card/column in workspace state. `dragover` should only change highlight when the hovered destination column changes.

- [ ] **Step 2: Make drop update data + DOM directly**

On a real stage change: update `user.column`, `user.updatedAt`, call `saveData()`, append the existing dragged card node into the target body, and refresh source/target count badges. Do not synchronously call the full legacy `render()`.

- [ ] **Step 3: Reconcile only when necessary**

When global search/task/tag/column filters are active, queue one legacy render with `requestIdleCallback` (or a timeout fallback). Cancel/coalesce duplicate pending reconciliations.

- [ ] **Step 4: Disable expensive drag-time visuals**

While `body.board-drag-active` is present, disable card transforms/transitions/shadows and child pointer hit-testing so Chrome has less paint/hit-test work during native dragging.

- [ ] **Step 5: Run all tests and syntax checks**

Expected: Python contract tests, Node syntax checks, and headless Chrome smoke all pass.

- [ ] **Step 6: Commit**

Commit message: `perf: streamline customer card dragging`

### Task 4: Final verification

**Files:**
- No production changes unless verification exposes a defect.

- [ ] **Step 1: Verify 1440 and 1920 screenshots in CI artifacts**

1440: all five stage headers visible simultaneously with two-card rows. 1920: all five stages visible with three-card rows.

- [ ] **Step 2: Verify drag behavior**

Drag repeatedly across columns: only one destination highlight is active, card follows immediately on drop, counts update, and no synchronous full-board redraw occurs during drag/drop.

- [ ] **Step 3: Verify CRM compatibility**

Reload after a move and confirm the card remains in the new stage from `sales_followup_data_v3`; existing follow-up fields and history are unchanged.
