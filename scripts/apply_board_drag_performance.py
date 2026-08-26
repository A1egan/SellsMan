from pathlib import Path

js_path = Path('assets/workspace-v2.js')
css_path = Path('assets/workspace-v2.css')

js = js_path.read_text(encoding='utf-8')
js_marker = '/* board v3 · optimized legacy customer drag */'
if js_marker not in js:
    js_block = r'''

/* board v3 · optimized legacy customer drag */
;(function installBoardDragPerformance() {
  'use strict';

  if (typeof globalThis.onDragStart !== 'function' || typeof globalThis.onDrop !== 'function') return;

  const legacyDrag = {
    start: globalThis.onDragStart,
    over: globalThis.onDragOver,
    leave: globalThis.onDragLeave,
    end: globalThis.onDragEnd,
    drop: globalThis.onDrop,
  };

  const dragState = {
    id: '',
    sourceCol: '',
    targetBody: null,
    card: null,
  };

  function clearTarget() {
    if (dragState.targetBody) dragState.targetBody.classList.remove('drag-over');
    dragState.targetBody = null;
  }

  function finishDrag(card) {
    clearTarget();
    const activeCard = card || dragState.card;
    if (activeCard && activeCard.classList) activeCard.classList.remove('dragging');
    document.body.classList.remove('board-drag-active');
    dragState.id = '';
    dragState.sourceCol = '';
    dragState.card = null;
    try { dragId = null; } catch (_) {}
  }

  function canRenderBoardColumn() {
    return typeof renderCard === 'function' &&
      typeof followupRank === 'function' &&
      typeof matchesTaskFilter === 'function' &&
      typeof getTag === 'function' &&
      typeof COLUMN_LIMIT !== 'undefined' &&
      typeof expandedCols !== 'undefined' &&
      typeof colFilters !== 'undefined';
  }

  function filteredColumnUsers(colId) {
    const searchEl = document.getElementById('searchInput');
    const searchVal = searchEl ? searchEl.value.trim().toLowerCase() : '';
    let colUsers = users.filter(u => u.column === colId);

    if (typeof taskFilter !== 'undefined' && taskFilter !== 'all') {
      colUsers = colUsers.filter(u => matchesTaskFilter(u, taskFilter));
    }

    if (searchVal) {
      colUsers = colUsers.filter(u =>
        String(u.number || '').toLowerCase().includes(searchVal) ||
        (u.note && String(u.note).toLowerCase().includes(searchVal)) ||
        (u.tags && u.tags.some(tid => {
          const tag = getTag(tid);
          return tag && String(tag.name || '').toLowerCase().includes(searchVal);
        }))
      );
    }

    if (typeof activeTagFilter !== 'undefined' && activeTagFilter) {
      colUsers = colUsers.filter(u => u.tags && u.tags.includes(activeTagFilter));
    }

    if (colFilters[colId]) {
      colUsers = colUsers.filter(u => u.tags && u.tags.includes(colFilters[colId]));
    }

    colUsers.sort((a, b) => {
      const ar = followupRank(a), br = followupRank(b);
      if (ar !== br) return ar - br;
      const at = a.nextFollowUpAt || Number.MAX_SAFE_INTEGER;
      const bt = b.nextFollowUpAt || Number.MAX_SAFE_INTEGER;
      if (at !== bt) return at - bt;
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });

    return { colUsers, searchVal };
  }

  function renderBoardColumn(colId) {
    const body = document.querySelector(`.column-body[data-col="${colId}"]`);
    if (!body) return false;

    const { colUsers, searchVal } = filteredColumnUsers(colId);
    const countEl = document.getElementById(`count-${colId}`);
    if (countEl) countEl.textContent = colUsers.length;

    const filterBtn = document.getElementById(`filterBtn-${colId}`);
    if (filterBtn) {
      const filterId = colFilters[colId];
      if (filterId) {
        const tag = getTag(filterId);
        filterBtn.classList.add('on');
        filterBtn.textContent = '筛选: ' + (tag ? tag.name : '');
      } else {
        filterBtn.classList.remove('on');
        filterBtn.textContent = '筛选';
      }
    }

    if (!colUsers.length) {
      body.innerHTML = '<div class="empty-state">暂无用户</div>';
      return true;
    }

    const isExpanded = expandedCols.has(colId) || !!searchVal;
    const visible = isExpanded ? colUsers : colUsers.slice(0, COLUMN_LIMIT);
    let html = visible.map(u => renderCard(u)).join('');
    if (!isExpanded && colUsers.length > COLUMN_LIMIT) {
      const rest = colUsers.length - COLUMN_LIMIT;
      html += `<button class="show-more-btn" onclick="expandCol('${colId}')">显示更多（剩 ${rest} 个）↓</button>`;
    }
    body.innerHTML = html;
    return true;
  }

  function partialRefresh(sourceCol, targetCol) {
    if (!canRenderBoardColumn()) return false;
    try {
      const sourceOk = renderBoardColumn(sourceCol);
      const targetOk = sourceCol === targetCol ? true : renderBoardColumn(targetCol);
      if (!sourceOk || !targetOk) return false;
      if (typeof renderStats === 'function') renderStats();
      return true;
    } catch (err) {
      console.warn('Board partial refresh fell back to legacy render', err);
      return false;
    }
  }

  globalThis.onDragStart = function optimizedBoardDragStart(event, id) {
    dragState.id = String(id || '');
    dragState.card = event && event.target && event.target.closest ? event.target.closest('.card') : event.target;
    const user = users.find(u => String(u.id) === dragState.id);
    dragState.sourceCol = user ? user.column : '';
    try { dragId = id; } catch (_) {}

    if (event && event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    if (dragState.card && dragState.card.classList) dragState.card.classList.add('dragging');
    document.body.classList.add('board-drag-active');
  };

  globalThis.onDragOver = function optimizedBoardDragOver(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (event && event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const target = event && event.currentTarget;
    if (!target || !target.classList) return;
    if (dragState.targetBody === target) return;
    clearTarget();
    dragState.targetBody = target;
    target.classList.add('drag-over');
  };

  globalThis.onDragLeave = function optimizedBoardDragLeave(event) {
    const target = event && event.currentTarget;
    if (!target || target !== dragState.targetBody) return;
    const related = event.relatedTarget;
    if (related && target.contains && target.contains(related)) return;
    clearTarget();
  };

  globalThis.onDragEnd = function optimizedBoardDragEnd(event) {
    finishDrag(event && event.target);
  };

  globalThis.onDrop = function optimizedBoardDrop(event) {
    if (event && event.preventDefault) event.preventDefault();
    const targetBody = event && event.currentTarget;
    if (targetBody && targetBody.classList) targetBody.classList.remove('drag-over');

    const id = dragState.id || (typeof dragId !== 'undefined' ? String(dragId || '') : '');
    if (!id || !targetBody || !targetBody.dataset) {
      finishDrag(event && event.target);
      return;
    }

    const user = users.find(u => String(u.id) === String(id));
    const targetCol = targetBody.dataset.col;
    if (!user || !targetCol || user.column === targetCol) {
      finishDrag(event && event.target);
      return;
    }

    const sourceCol = user.column;
    user.column = targetCol;
    user.updatedAt = Date.now();
    if (typeof saveData === 'function') saveData();

    if (!partialRefresh(sourceCol, targetCol)) {
      // Data has already been updated and persisted; one legacy render is the safe fallback.
      if (typeof render === 'function') render();
    }

    finishDrag(event && event.target);
  };

  globalThis.__boardDragPerformance = {
    partialRefresh,
    renderBoardColumn,
    legacyDrag,
  };
})();
'''
    js_path.write_text(js.rstrip() + js_block + '\n', encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
css_marker = '/* board v3 · drag paint suppression */'
if css_marker not in css:
    css_block = r'''

/* board v3 · drag paint suppression */
body.board-drag-active .workspace-view[data-view="board"] .card,
body.board-drag-active .workspace-view[data-view="board"] .card-actions,
body.board-drag-active .workspace-view[data-view="board"] .column-body {
  transition: none !important;
}

body.board-drag-active .workspace-view[data-view="board"] .card:not(.dragging),
body.board-drag-active .workspace-view[data-view="board"] .card:hover {
  transform: none !important;
  box-shadow: none !important;
}

body.board-drag-active .workspace-view[data-view="board"] .card .card-actions {
  opacity: 0 !important;
}

body.board-drag-active .workspace-view[data-view="board"] .board,
body.board-drag-active .workspace-view[data-view="board"] .card {
  cursor: grabbing;
}
'''
    css_path.write_text(css.rstrip() + css_block + '\n', encoding='utf-8')
