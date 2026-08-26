(function() {
  'use strict';

  let boardDragId = '';
  let boardDragSourceCol = '';
  let boardDragOverCol = '';
  let boardDragElement = null;
  let reconcileHandle = null;
  let reconcileKind = '';

  function ensureBoardStyles() {
    if (typeof document === 'undefined') return;
    if (document.querySelector('link[data-workspace-board-style="1"]')) return;
    const current = document.currentScript;
    const base = current && current.src ? current.src.replace(/[^/]+(?:\?.*)?$/, '') : 'assets/';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'workspace-v2-board.css';
    link.dataset.workspaceBoardStyle = '1';
    document.head.appendChild(link);
  }

  function clearDragOver() {
    document.querySelectorAll('.workspace-view[data-view="board"] .column-body.drag-over')
      .forEach(body => body.classList.remove('drag-over'));
    boardDragOverCol = '';
  }

  function cleanupDragState() {
    if (boardDragElement) boardDragElement.classList.remove('dragging');
    clearDragOver();
    document.body.classList.remove('board-drag-active');
    boardDragId = '';
    boardDragSourceCol = '';
    boardDragElement = null;
  }

  function hasActiveBoardFilters() {
    const search = document.getElementById('searchInput');
    const hasSearch = !!(search && search.value && search.value.trim());
    const hasTaskFilter = typeof taskFilter !== 'undefined' && taskFilter && taskFilter !== 'all';
    const hasGlobalTag = typeof activeTagFilter !== 'undefined' && !!activeTagFilter;
    const hasColumnTag = typeof colFilters !== 'undefined' && colFilters && Object.keys(colFilters).length > 0;
    return hasSearch || hasTaskFilter || hasGlobalTag || hasColumnTag;
  }

  function cancelBoardReconcile() {
    if (reconcileHandle == null) return;
    if (reconcileKind === 'idle' && typeof globalThis.cancelIdleCallback === 'function') {
      globalThis.cancelIdleCallback(reconcileHandle);
    } else {
      clearTimeout(reconcileHandle);
    }
    reconcileHandle = null;
    reconcileKind = '';
  }

  function scheduleBoardReconcile() {
    cancelBoardReconcile();
    const run = function() {
      reconcileHandle = null;
      reconcileKind = '';
      if (location.hash && location.hash !== '#board') return;
      if (typeof globalThis.render === 'function') globalThis.render();
    };

    if (typeof globalThis.requestIdleCallback === 'function') {
      reconcileKind = 'idle';
      reconcileHandle = globalThis.requestIdleCallback(run, { timeout: 900 });
    } else {
      reconcileKind = 'timeout';
      reconcileHandle = setTimeout(run, 140);
    }
  }

  function getStageCount(columnId) {
    if (typeof users === 'undefined' || !Array.isArray(users)) return 0;
    return users.reduce((count, user) => count + (user.column === columnId ? 1 : 0), 0);
  }

  function refreshStageCount(columnId) {
    if (!columnId || hasActiveBoardFilters()) return;
    const count = document.getElementById('count-' + columnId);
    if (count) count.textContent = String(getStageCount(columnId));
  }

  function columnBody(columnId) {
    if (!columnId) return null;
    return document.querySelector('.workspace-view[data-view="board"] .column-body[data-col="' + columnId + '"]');
  }

  function moveDraggedCard(targetBody, sourceColumn, targetColumn) {
    const card = boardDragElement;
    if (!card || !targetBody) return;

    const targetEmpty = targetBody.querySelector('.empty-state');
    if (targetEmpty) targetEmpty.remove();

    const showMore = targetBody.querySelector('.show-more-btn');
    if (showMore) targetBody.insertBefore(card, showMore);
    else targetBody.appendChild(card);

    const sourceBody = columnBody(sourceColumn);
    if (sourceBody && getStageCount(sourceColumn) === 0 && !sourceBody.querySelector('.empty-state')) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '暂无用户';
      sourceBody.appendChild(empty);
    }

    refreshStageCount(sourceColumn);
    refreshStageCount(targetColumn);
  }

  function boardNeedsReconcile(sourceColumn, targetColumn) {
    if (hasActiveBoardFilters()) return true;
    const sourceBody = columnBody(sourceColumn);
    const targetBody = columnBody(targetColumn);
    return !!(
      (sourceBody && sourceBody.querySelector('.show-more-btn')) ||
      (targetBody && targetBody.querySelector('.show-more-btn'))
    );
  }

  function stageName(columnId) {
    if (typeof COLUMNS === 'undefined' || !Array.isArray(COLUMNS)) return columnId;
    const stage = COLUMNS.find(column => column.id === columnId);
    return stage ? stage.name : columnId;
  }

  function installBoardDragOptimizations() {
    if (typeof document === 'undefined') return;
    ensureBoardStyles();

    globalThis.onDragStart = function(e, id) {
      boardDragId = String(id || '');
      boardDragElement = e && e.currentTarget && e.currentTarget.classList && e.currentTarget.classList.contains('card')
        ? e.currentTarget
        : (e && e.target && e.target.closest ? e.target.closest('.card') : null);
      const user = typeof users !== 'undefined' && Array.isArray(users)
        ? users.find(item => item.id === boardDragId)
        : null;
      boardDragSourceCol = user ? user.column : '';
      boardDragOverCol = '';
      document.body.classList.add('board-drag-active');
      if (boardDragElement) boardDragElement.classList.add('dragging');
      if (e && e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', boardDragId); } catch (_) {}
      }
    };

    globalThis.onDragOver = function(e) {
      if (!e) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const target = e.currentTarget;
      const columnId = target && target.dataset ? String(target.dataset.col || '') : '';
      if (!columnId || boardDragOverCol === columnId) return;
      clearDragOver();
      target.classList.add('drag-over');
      boardDragOverCol = columnId;
    };

    globalThis.onDragLeave = function() {
      // Keep the current highlight until another column is entered. This avoids
      // dragleave churn while the pointer crosses hundreds of child elements.
    };

    globalThis.onDrop = function(e) {
      if (!e) return;
      e.preventDefault();
      const targetBody = e.currentTarget;
      const newColumn = targetBody && targetBody.dataset ? String(targetBody.dataset.col || '') : '';
      const user = typeof users !== 'undefined' && Array.isArray(users)
        ? users.find(item => item.id === boardDragId)
        : null;
      if (!user || !newColumn) {
        cleanupDragState();
        return;
      }

      const sourceColumn = user.column || boardDragSourceCol;
      if (sourceColumn === newColumn) {
        cleanupDragState();
        return;
      }

      user.column = newColumn;
      user.updatedAt = Date.now();
      if (typeof saveData === 'function') saveData();
      moveDraggedCard(targetBody, sourceColumn, newColumn);

      if (boardNeedsReconcile(sourceColumn, newColumn)) scheduleBoardReconcile();
      if (typeof showToast === 'function') showToast('已移动到「' + stageName(newColumn) + '」');
      cleanupDragState();
    };

    globalThis.onDragEnd = function() {
      cleanupDragState();
    };
  }

  globalThis.WorkspaceV2Board = {
    installBoardDragOptimizations,
    scheduleBoardReconcile,
  };

  installBoardDragOptimizations();
})();
