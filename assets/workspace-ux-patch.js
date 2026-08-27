(function(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkspaceUxPatch = api;
  if (root && root.document) api.install();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  const LAST_SUCCESS_KEY = 'sales_cloud_last_success_v1';
  const FALLBACK_STAGES = [
    { id: 'pending', name: '待跟进' },
    { id: 'contacting', name: '高意向' },
    { id: 'replied', name: '一般' },
    { id: 'lowinterest', name: '低意向池' },
    { id: 'silent', name: '沉默用户' },
  ];

  let workspaceInstalled = false;
  let cloudInstalled = false;
  let searchObserver = null;
  let stageObserver = null;
  let boardObserver = null;

  function parseTime(value) {
    const time = Date.parse(String(value || ''));
    return Number.isFinite(time) ? time : 0;
  }

  function shouldStampSuccessfulSync(status) {
    const value = status && typeof status === 'object' ? status : {};
    return value.mode === 'synced' &&
      Number(value.pendingCount || 0) === 0 &&
      Number(value.conflictCount || 0) === 0 &&
      !value.error;
  }

  function decorateSyncStatus(status, successfulAt) {
    const value = status && typeof status === 'object' ? { ...status } : {};
    const stored = String(successfulAt || '');
    if (parseTime(stored) > parseTime(value.lastSyncedAt)) value.lastSyncedAt = stored;
    return value;
  }

  function getStageOptions(columns, currentId) {
    const source = Array.isArray(columns) && columns.length ? columns : FALLBACK_STAGES;
    const seen = new Set();
    return source.reduce((list, item) => {
      const id = String(item && item.id || '').trim();
      if (!id || seen.has(id)) return list;
      seen.add(id);
      list.push({ id, name: String(item && item.name || id), current: id === String(currentId || '') });
      return list;
    }, []);
  }

  function readLastSuccess() {
    try { return root.localStorage ? String(root.localStorage.getItem(LAST_SUCCESS_KEY) || '') : ''; }
    catch (_) { return ''; }
  }

  function writeLastSuccess(value) {
    try { if (root.localStorage) root.localStorage.setItem(LAST_SUCCESS_KEY, String(value || '')); }
    catch (_) {}
  }

  function installCloudSyncFix() {
    const cloud = root.CloudSync;
    if (cloudInstalled || !cloud || typeof cloud.pull !== 'function' || typeof cloud.flushPending !== 'function' || typeof cloud.getStatus !== 'function') return false;
    cloudInstalled = true;

    const originalGetStatus = cloud.getStatus.bind(cloud);
    const originalOnStatus = typeof cloud.onStatus === 'function' ? cloud.onStatus.bind(cloud) : null;
    const subscribers = new Set();

    cloud.getStatus = function() {
      return decorateSyncStatus(originalGetStatus(), readLastSuccess());
    };

    if (originalOnStatus) {
      cloud.onStatus = function(listener) {
        if (typeof listener !== 'function') return originalOnStatus(listener);
        const entry = {
          listener,
          wrapped(status) { listener(decorateSyncStatus(status, readLastSuccess())); }
        };
        subscribers.add(entry);
        const unsubscribe = originalOnStatus(entry.wrapped);
        return function() {
          subscribers.delete(entry);
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      };
    }

    cloud.manualSync = async function() {
      const pullResult = await cloud.pull('manual');
      if (!pullResult || pullResult.status !== 'ok') {
        return decorateSyncStatus(originalGetStatus(), readLastSuccess());
      }

      await cloud.flushPending();
      const rawStatus = originalGetStatus();
      if (!shouldStampSuccessfulSync(rawStatus)) return decorateSyncStatus(rawStatus, readLastSuccess());

      const successfulAt = new Date().toISOString();
      writeLastSuccess(successfulAt);
      const next = decorateSyncStatus(rawStatus, successfulAt);
      subscribers.forEach(entry => {
        try { entry.listener(next); } catch (_) {}
      });
      return next;
    };

    return true;
  }

  function injectStyles() {
    const doc = root.document;
    if (!doc || doc.getElementById('workspaceUxPatchStyles')) return;
    const style = doc.createElement('style');
    style.id = 'workspaceUxPatchStyles';
    style.textContent = `
      .workspace-search-clear-wrap{position:relative;display:inline-flex;align-items:center;min-width:0}
      .workspace-search-clear-wrap .workspace-quick-search,.workspace-search-clear-wrap .ws-input{padding-right:32px}
      .workspace-search-clear-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:20px;height:20px;border:0;border-radius:50%;background:transparent;color:#6b7280;font-size:17px;line-height:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
      .workspace-search-clear-btn:hover{background:#e5e7eb;color:#111827}
      .workspace-search-clear-btn[hidden]{display:none}
      .workspace-customer-stage-move{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .workspace-customer-stage-move>span{font-size:12px;font-weight:800;color:#4b5563}
      .workspace-customer-stage-select{min-width:128px;padding:5px 9px;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#111827;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
    `;
    doc.head.appendChild(style);
  }

  function dispatchInput(input) {
    if (!input) return;
    const EventCtor = root.Event;
    if (typeof EventCtor === 'function') input.dispatchEvent(new EventCtor('input', { bubbles: true }));
  }

  function wrapSearchInput(input, buttonId, onClear) {
    const doc = root.document;
    if (!doc || !input) return null;
    let button = doc.getElementById(buttonId);
    if (button) return button;

    let wrapper = input.parentElement;
    if (!wrapper || !wrapper.classList.contains('workspace-search-clear-wrap')) {
      wrapper = doc.createElement('span');
      wrapper.className = 'workspace-search-clear-wrap';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }

    button = doc.createElement('button');
    button.id = buttonId;
    button.type = 'button';
    button.className = 'workspace-search-clear-btn';
    button.setAttribute('aria-label', '清空搜索');
    button.textContent = '×';
    wrapper.appendChild(button);

    const syncVisibility = () => { button.hidden = !String(input.value || ''); };
    input.addEventListener('input', syncVisibility);
    button.addEventListener('click', () => {
      input.value = '';
      dispatchInput(input);
      if (typeof onClear === 'function') onClear();
      syncVisibility();
      input.focus();
    });
    syncVisibility();
    return button;
  }

  function ensureSearchClears() {
    const doc = root.document;
    if (!doc) return;
    const topInput = doc.getElementById('workspaceQuickSearch');
    const topButton = wrapSearchInput(topInput, 'workspaceQuickSearchClear', () => {
      const pageInput = doc.getElementById('wsSearchInput');
      if (pageInput && pageInput.value) {
        pageInput.value = '';
        dispatchInput(pageInput);
      }
    });
    if (topButton && topInput) topButton.hidden = !String(topInput.value || '');

    const pageInput = doc.getElementById('wsSearchInput');
    const pageButton = wrapSearchInput(pageInput, 'wsSearchInputClear', () => {
      if (topInput) {
        topInput.value = '';
        const topClear = doc.getElementById('workspaceQuickSearchClear');
        if (topClear) topClear.hidden = true;
      }
    });
    if (pageButton && pageInput) pageButton.hidden = !String(pageInput.value || '');
  }

  function installSearchClears() {
    const doc = root.document;
    if (!doc) return;
    ensureSearchClears();
    const target = doc.getElementById('workspaceViewStack') || doc.body;
    if (root.MutationObserver && target && !searchObserver) {
      searchObserver = new root.MutationObserver(() => ensureSearchClears());
      searchObserver.observe(target, { childList: true, subtree: true });
    }
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('hashchange', () => setTimeout(ensureSearchClears, 0));
    }
  }

  function removeBoardControls() {
    const doc = root.document;
    if (!doc) return;
    const controls = doc.getElementById('workspaceBoardScrollControls');
    if (controls) controls.remove();
  }

  function installBoardCleanup() {
    const doc = root.document;
    if (!doc) return;
    removeBoardControls();
    const taskBar = doc.getElementById('taskBar');
    if (root.MutationObserver && taskBar && !boardObserver) {
      boardObserver = new root.MutationObserver(removeBoardControls);
      boardObserver.observe(taskBar, { childList: true, subtree: true });
    }
  }

  function currentColumns() {
    try {
      if (typeof COLUMNS !== 'undefined' && Array.isArray(COLUMNS)) return COLUMNS;
    } catch (_) {}
    return FALLBACK_STAGES;
  }

  function currentModalUser() {
    try {
      const id = typeof modalUserId !== 'undefined' ? String(modalUserId || '') : '';
      const list = typeof users !== 'undefined' && Array.isArray(users) ? users : [];
      return list.find(user => user && String(user.id) === id) || null;
    } catch (_) { return null; }
  }

  function stageName(stageId) {
    const found = getStageOptions(currentColumns(), stageId).find(item => item.id === String(stageId || ''));
    return found ? found.name : String(stageId || '');
  }

  function moveCurrentCustomer(targetId) {
    const target = String(targetId || '');
    const user = currentModalUser();
    if (!user || !target || String(user.column || '') === target) return false;
    user.column = target;
    user.updatedAt = Date.now();
    try { if (typeof saveData === 'function') saveData(); } catch (_) {}
    try { if (typeof render === 'function') render(); } catch (_) {}
    try { if (typeof renderTagModal === 'function') renderTagModal(); } catch (_) {}
    try { if (typeof showToast === 'function') showToast(`已移入${stageName(target)}`); } catch (_) {}
    return true;
  }

  function patchStageMover() {
    const doc = root.document;
    if (!doc) return;
    const modal = doc.getElementById('tagModal');
    if (!modal) return;
    const zone = modal.querySelector('.detail-danger-zone');
    if (!zone) return;

    const user = currentModalUser();
    const current = user ? String(user.column || '') : '';
    let wrapper = zone.querySelector('.workspace-customer-stage-move');
    let select = doc.getElementById('workspaceCustomerStageSelect');

    if (!wrapper) {
      const oldLowButton = Array.from(zone.querySelectorAll('button')).find(button => String(button.textContent || '').includes('移入低意向池'));
      wrapper = doc.createElement('label');
      wrapper.className = 'workspace-customer-stage-move';
      wrapper.innerHTML = '<span>移动到栏目</span><select class="workspace-customer-stage-select" id="workspaceCustomerStageSelect" aria-label="移动客户到栏目"></select>';
      if (oldLowButton) oldLowButton.replaceWith(wrapper);
      else zone.insertBefore(wrapper, zone.firstChild);
      select = wrapper.querySelector('select');
      select.addEventListener('change', () => moveCurrentCustomer(select.value));
    }

    if (!select) return;
    const stages = getStageOptions(currentColumns(), current);
    select.innerHTML = stages.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
    if (current && stages.some(item => item.id === current)) select.value = current;
  }

  function installStageMover() {
    const doc = root.document;
    if (!doc) return;
    patchStageMover();
    const modal = doc.getElementById('tagModal');
    if (root.MutationObserver && modal && !stageObserver) {
      stageObserver = new root.MutationObserver(() => patchStageMover());
      stageObserver.observe(modal, { childList: true, subtree: true });
    }
  }

  function install() {
    if (workspaceInstalled || !root.document) return;
    workspaceInstalled = true;
    injectStyles();
    installSearchClears();
    installBoardCleanup();
    installStageMover();
    installCloudSyncFix();
  }

  return {
    LAST_SUCCESS_KEY,
    shouldStampSuccessfulSync,
    decorateSyncStatus,
    getStageOptions,
    installCloudSyncFix,
    install,
  };
});
