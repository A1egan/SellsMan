# Board Five-Column Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer board show all five stages on a 1440px desktop while keeping cards readable, and remove the dominant sources of drag jank.

**Architecture:** Keep the legacy CRM data/render engine intact. Add responsive board layout overrides in `assets/workspace-v2.css`, and let `assets/workspace-v2.js` take over the legacy drag handlers so normal drops can update only the two affected columns plus counts instead of re-rendering the full board. Use real headless Chrome probes for geometry and drag behavior.

**Tech Stack:** Static HTML/CSS/JavaScript, Python contract tests, shell + headless Chrome smoke tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-26-board-five-column-performance-design.md`

## Global Constraints

- Do not change the CRM localStorage key or customer data schema.
- Do not change the five stage IDs or their semantics.
- At ~1440px, five columns must fit with readable 2-card rows; at >=1800px use 3-card rows; under ~1280px keep horizontal fallback.
- Do not use global scale/zoom to fake five-column fit.
- Normal drag/drop must preserve persistence and existing filters/expanded-column behavior.
- Existing menu layering and board-scroll fallbacks must remain functional.

---

### Task 1: Add failing five-column geometry regression

**Files:**
- Create: `tests/test_board_five_column_runtime.sh`
- Modify: `.github/workflows/ui-contract.yml`

**Interfaces:**
- Consumes: current `#board` DOM and `.workspace-shell` sidebar behavior.
- Produces: runtime assertions for 1440/1920/1200 board geometry and card-grid density.

- [ ] **Step 1: Write the failing test**

Create a headless-Chrome test page/probe that loads `#board` at 1440×900, 1920×1080, and 1200×900 and records `board.clientWidth`, `board.scrollWidth`, each column rect, and `gridTemplateColumns` for `.column-body[data-col="pending"]`. Assert 1440 and 1920 have no meaningful horizontal overflow and all five columns fit; assert 1440 resolves to two card tracks and 1920 to three; assert 1200 may overflow.

- [ ] **Step 2: Run test to verify it fails**

Run through a draft PR CI job. Expected failure: current fixed column widths produce `scrollWidth > clientWidth` at 1440 and/or five columns extend past the board viewport.

- [ ] **Step 3: Commit test-only RED state**

Commit the probe and workflow step before any production CSS.

---

### Task 2: Implement responsive five-column board layout

**Files:**
- Modify: `assets/workspace-v2.css`
- Test: `tests/test_board_five_column_runtime.sh`

**Interfaces:**
- Consumes: existing `.board`, `.column`, `.column-body` selectors.
- Produces: responsive five-column fit with 2/3-card density and narrow-screen overflow fallback.

- [ ] **Step 1: Add minimal desktop CSS**

At `min-width:1280px`, make board columns flex equally with `min-width:0`, reduce board/column gaps and padding, and force five columns to fit the board viewport. Use two card tracks for column bodies at 1280–1799px, including `pending`; at `min-width:1800px`, use three tracks. Keep customer text size readable; only compress spacing and secondary content where needed.

- [ ] **Step 2: Preserve narrow-screen fallback**

Below 1280px, keep fixed minimum column widths and `overflow-x:auto` so existing left/right controls remain useful.

- [ ] **Step 3: Run geometry regression**

Expected: 1440 and 1920 fit all five columns; 1440 has two card tracks; 1920 has three.

- [ ] **Step 4: Run existing board/menu/browser regressions**

Expected: all existing UI tests pass.

---

### Task 3: Add failing drag-performance behavior regression

**Files:**
- Create: `tests/test_board_drag_runtime.sh`
- Modify: `.github/workflows/ui-contract.yml`

**Interfaces:**
- Consumes: legacy global drag handlers and the rendered board.
- Produces: assertions that drag enters a lightweight state, same-column dragover avoids repeated global class sweeps, and drop does not invoke full legacy render on the normal path.

- [ ] **Step 1: Write the failing runtime probe**

In Chrome, seed enough customer cards to exercise multiple columns, wrap the legacy render function with a counter, instrument `document.querySelectorAll('.column-body')`/class changes during repeated dragover, and simulate drag start → repeated dragover on one target → drop. Assert a board drag-active class appears, repeated same-target dragover does not repeatedly sweep all columns, the user moves stages and persists, and full render count stays zero for the drop path.

- [ ] **Step 2: Run test to verify it fails**

Expected: current legacy handlers repeatedly clear/highlight and drop calls full `render()`.

- [ ] **Step 3: Commit test-only RED state**

Commit before production JS changes.

---

### Task 4: Replace legacy board drag hot path

**Files:**
- Modify: `assets/workspace-v2.js`
- Modify: `assets/workspace-v2.css`
- Test: `tests/test_board_drag_runtime.sh`

**Interfaces:**
- Consumes: `users`, `COLUMNS`, `renderCard`, current column filters, `expandedCols`, `COLUMN_LIMIT`, `saveData`, `renderStats` from legacy script.
- Produces: `installBoardDragPerformance()` and local helpers that take over `onDragStart`, `onDragOver`, `onDragEnd`, `onDrop` after the legacy script loads.

- [ ] **Step 1: Add drag state and paint suppression**

On drag start, remember source user/column, add a `board-drag-active` class, and mark only the dragged card. CSS under this class disables card transitions, hover transforms, expensive hover shadows, and nonessential pointer effects.

- [ ] **Step 2: Make dragover target-aware**

Track the last target column. Only when target changes, remove `drag-over` from the previous target and add it to the new one. Same-target dragover only calls `preventDefault()` and sets drop effect.

- [ ] **Step 3: Implement two-column partial render**

After a valid drop, update `user.column` and `updatedAt`, call the existing persistence function, then rebuild only the source and target `.column-body` using the same search/filter/expanded/COLUMN_LIMIT rules as legacy render. Update column badges and stats/sidebar counts without rebuilding unaffected card DOM.

- [ ] **Step 4: Add safe fallback**

If required legacy helpers are unavailable or a partial refresh cannot safely reproduce current filter state, fall back once to the captured legacy render rather than risking stale data.

- [ ] **Step 5: Run drag regression and existing suite**

Expected: runtime drag probe passes; normal drop full-render counter stays zero; existing tests remain green.

---

### Task 5: Visual QA and final branch verification

**Files:**
- Modify only if tests expose a defect.

**Interfaces:**
- Consumes: final branch.
- Produces: screenshots and merge-ready PR.

- [ ] **Step 1: Capture 1440×900 and 1920×1080 board screenshots**

Verify all five stage headers are simultaneously visible, 1440 card content remains readable, and 1920 uses three cards per row.

- [ ] **Step 2: Verify 1200 fallback**

Confirm horizontal scroll/left-right controls still work below the five-column breakpoint.

- [ ] **Step 3: Run full CI from final head commit**

Require legacy contract, Workspace contract, readability, menu layering, five-column runtime, drag runtime, core Node tests, and browser smoke all to pass.

- [ ] **Step 4: Review `main...feat/board-five-column-performance` diff**

Confirm no seed/customer data or localStorage schema changes and no temporary patch workflow/scripts remain.

- [ ] **Step 5: Open merge-ready PR**

Describe geometry behavior, drag optimization, test evidence, and remaining responsive fallback.
