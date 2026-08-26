# Five-Column Board + Drag Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer board show all five stages on a normal 1440px desktop without horizontal scrolling while eliminating visible stutter/freeze during card dragging.

**Architecture:** Keep the latest `main` CRM/workspace code intact. Add an isolated board enhancement layer (`workspace-v2-board.css/js`) loaded by the small workspace core bootstrap, so the large legacy `index.html` and newer workspace application files do not need to be rewritten. The enhancement overrides only the legacy board drag globals and uses idle reconciliation when a full render is actually needed.

**Tech Stack:** Static HTML/CSS/JavaScript, GitHub Pages, Python contract tests, Node syntax checks, headless Chrome smoke tests.

**Spec:** `docs/superpowers/specs/2026-08-26-crm-workspace-v2-design.md`

## Global Constraints

- Preserve `sales_followup_data_v3` and all existing customer/tag/follow-up semantics.
- Do not overwrite newer `main` workspace JS/CSS while fixing the board.
- 1440-class desktop widths: five stage columns visible simultaneously, two cards per row.
- 1800px+ widths: five stage columns visible, three cards per row.
- Narrow widths: retain horizontal scrolling instead of shrinking text into unreadability.
- Dragging must not synchronously full-render the board.
- Filtered/show-more states may reconcile with one coalesced idle render after drop.

---

### Task 1: Add failing board regression contract
- Modify `tests/test_workspace_v2_contract.py` to require the isolated board assets, five-column CSS, drag override functions, and no synchronous `render()` inside optimized `onDrop`.
- Push test-only change and confirm CI fails because the new assets do not exist.

### Task 2: Add responsive board density layer
- Create `assets/workspace-v2-board.css`.
- Use a five-column grid at normal desktop widths.
- Force all board column bodies to two cards per row at 1440-class widths and three at 1800px+.
- Clamp long note text and tighten spacing without reducing core readability.
- Fall back to horizontally scrollable fixed-width columns below the desktop threshold.

### Task 3: Add drag performance layer
- Create `assets/workspace-v2-board.js`.
- Override `onDragStart`, `onDragOver`, `onDragLeave`, `onDrop`, `onDragEnd` after the legacy engine exists.
- Change destination highlight only when the destination column changes.
- On drop, update the user model, save, move the existing card node, and refresh stage counts without synchronous full render.
- Queue at most one `requestIdleCallback` reconciliation when filters/show-more make DOM-only movement insufficient.
- Add/remove `body.board-drag-active` so CSS can disable shadows/transitions/child hit-testing during the native drag.

### Task 4: Load enhancement without touching newer app files
- Modify only `assets/workspace-v2-core.js` to browser-load `workspace-v2-board.js`.
- Keep Node/core behavior unchanged when `document` is absent.

### Task 5: Verify
- Run all CI contract, Node syntax, and headless Chrome smoke tests.
- Inspect the 1440 board screenshot artifact for all five stage headers and the 1920 behavior for three-card density.
- Compare the repair branch against `main` and confirm only plan/test/core/new board assets changed.
