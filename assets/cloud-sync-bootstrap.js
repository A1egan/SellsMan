(function(root) {
  'use strict';

  const STORE_KEYS = {
    customers: 'sales_followup_data_v3',
    tags: 'sales_tags_v1',
    work_tasks: 'sales_work_tasks_v1',
  };
  let bridgeSuppress = false;

  function readStore(type) {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEYS[type]) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function wrapLegacySave(name, type) {
    const original = root[name];
    if (typeof original !== 'function' || original.__cloudSyncWrapped) return;
    const wrapped = function() {
      const result = original.apply(this, arguments);
      if (!bridgeSuppress && root.CloudSync) root.CloudSync.observeStoreWrite(type, readStore(type));
      return result;
    };
    wrapped.__cloudSyncWrapped = true;
    wrapped.__cloudSyncOriginal = original;
    root[name] = wrapped;
  }

  function installTaskStorageBridge() {
    if (!root.Storage || Storage.prototype.__cloudSyncTaskBridge) return;
    const original = Storage.prototype.setItem;
    Object.defineProperty(Storage.prototype, '__cloudSyncTaskBridge', { value: true, configurable: true });
    Storage.prototype.setItem = function(key, value) {
      const result = original.call(this, key, value);
      if (!bridgeSuppress && this === localStorage && key === STORE_KEYS.work_tasks && root.CloudSync) {
        root.CloudSync.observeStoreWrite('work_tasks', readStore('work_tasks'));
      }
      return result;
    };
  }

  function refreshLegacy(type) {
    bridgeSuppress = true;
    try {
      if (type === 'customers') {
        if (typeof root.loadData === 'function') root.loadData();
        if (typeof root.render === 'function') root.render();
        if (typeof root.renderTaskBar === 'function') root.renderTaskBar();
      } else if (type === 'tags') {
        if (typeof root.loadTags === 'function') root.loadTags();
        if (typeof root.render === 'function') root.render();
        if (typeof root.renderTagFilterBar === 'function') root.renderTagFilterBar();
      } else if (type === 'work_tasks' && root.WorkspaceV2) {
        if (typeof root.WorkspaceV2.loadWorkTasks === 'function') root.WorkspaceV2.loadWorkTasks();
      }
      if (root.WorkspaceV2 && typeof root.WorkspaceV2.renderCurrentView === 'function') root.WorkspaceV2.renderCurrentView();
    } finally {
      bridgeSuppress = false;
      if (root.CloudSync && typeof root.CloudSync._snapshotStores === 'function') root.CloudSync._snapshotStores();
    }
  }

  function downloadBackup() {
    const users = readStore('customers');
    const tags = readStore('tags');
    const workTasks = readStore('work_tasks');
    const payload = {
      app: 'A1eG4n工作台',
      version: 3,
      exportedAt: new Date().toISOString(),
      users,
      tags,
      workTasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `A1eG4n备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof root.showToast === 'function') root.showToast(`已备份 ${users.length} 名学员、${tags.length} 个标签、${workTasks.length} 个工作任务`);
  }

  function normalizeRestoreUsers(users) {
    return (Array.isArray(users) ? users : []).map(user => ({
      ...user,
      id: user.id || `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      number: String(user.number == null ? '' : user.number),
      column: user.column || 'pending',
      note: user.note || '',
      replied: !!user.replied,
      tags: Array.isArray(user.tags) ? user.tags : [],
      history: Array.isArray(user.history) ? user.history : [],
      nextFollowUpAt: Number(user.nextFollowUpAt || 0),
      nextAction: user.nextAction || '',
      lastResult: user.lastResult || '',
      lastContactAt: Number(user.lastContactAt || 0),
      createdAt: user.createdAt || Date.now(),
      updatedAt: user.updatedAt || Date.now(),
    }));
  }

  function restoreBackup(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); }
      catch (_) { if (typeof root.showToast === 'function') root.showToast('文件解析失败，请选择正确的备份文件'); return; }
      const users = Array.isArray(data && data.users) ? normalizeRestoreUsers(data.users) : (Array.isArray(data) ? normalizeRestoreUsers(data) : null);
      if (!users) { if (typeof root.showToast === 'function') root.showToast('备份文件格式不正确'); return; }
      const tags = Array.isArray(data.tags)
        ? data.tags.filter(tag => tag && tag.id).map(tag => ({ ...tag, id: String(tag.id), name: tag.name || tag.id, color: tag.color || '#4f46e5' }))
        : readStore('tags');
      const version = Number(data.version || 0);
      const workTasks = version === 2 || version === 3 ? (Array.isArray(data.workTasks) ? data.workTasks : []) : readStore('work_tasks');
      const confirmText = `恢复将用备份覆盖当前数据（${users.length} 名学员、${tags.length} 个标签、${workTasks.length} 个任务）${root.CloudSync && root.CloudSync.getStatus().mode === 'synced' ? '，并同步到云端' : ''}，是否继续？`;
      const apply = () => {
        if (root.CloudSync && typeof root.CloudSync._snapshotStores === 'function') root.CloudSync._snapshotStores();
        bridgeSuppress = true;
        try {
          localStorage.setItem(STORE_KEYS.customers, JSON.stringify(users));
          localStorage.setItem(STORE_KEYS.tags, JSON.stringify(tags));
          localStorage.setItem(STORE_KEYS.work_tasks, JSON.stringify(workTasks));
          if (typeof root.loadData === 'function') root.loadData();
          if (typeof root.loadTags === 'function') root.loadTags();
          if (root.WorkspaceV2 && typeof root.WorkspaceV2.loadWorkTasks === 'function') root.WorkspaceV2.loadWorkTasks();
          if (typeof root.render === 'function') root.render();
          if (root.WorkspaceV2 && typeof root.WorkspaceV2.renderCurrentView === 'function') root.WorkspaceV2.renderCurrentView();
        } finally { bridgeSuppress = false; }
        if (root.CloudSync) {
          root.CloudSync.observeStoreWrite('customers', readStore('customers'));
          root.CloudSync.observeStoreWrite('tags', readStore('tags'));
          root.CloudSync.observeStoreWrite('work_tasks', readStore('work_tasks'));
        }
        if (typeof root.showToast === 'function') root.showToast(`已恢复 ${users.length} 名学员`);
      };
      if (typeof root.showConfirm === 'function') root.showConfirm(confirmText, apply); else apply();
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
  }

  function installBackupOverrides() {
    root.backupData = downloadBackup;
    root.restoreData = restoreBackup;
  }

  function ensureUI() {
    if (document.getElementById('cloudSyncStatusBtn')) return;
    const actions = document.querySelector('.workspace-topbar-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = 'cloudSyncStatusBtn';
    button.type = 'button';
    button.className = 'ws-btn cloud-sync-status';
    button.textContent = '本地模式';
    actions.insertBefore(button, actions.firstChild);

    const overlay = document.createElement('div');
    overlay.id = 'cloudSyncModal';
    overlay.className = 'cloud-sync-overlay';
    overlay.innerHTML = '<div class="cloud-sync-modal"><button class="cloud-sync-close" type="button" aria-label="关闭">×</button><div id="cloudSyncModalBody"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(); });
    overlay.querySelector('.cloud-sync-close').addEventListener('click', closeModal);
    button.addEventListener('click', openStatusAction);
  }

  function showModal(html) {
    ensureUI();
    const overlay = document.getElementById('cloudSyncModal');
    const body = document.getElementById('cloudSyncModalBody');
    if (!overlay || !body) return;
    body.innerHTML = html;
    overlay.classList.add('show');
  }

  function closeModal() {
    const overlay = document.getElementById('cloudSyncModal');
    if (overlay) overlay.classList.remove('show');
  }

  function statusText(status) {
    if (status.mode === 'signed_out') return '登录云同步';
    if (status.mode === 'needs_init') return '初始化云端';
    if (status.mode === 'syncing') return '同步中…';
    if (status.mode === 'offline') return `离线 · ${status.pendingCount} 项待同步`;
    if (status.mode === 'conflict') return `${status.conflictCount} 项冲突`;
    if (status.mode === 'error') return '云同步异常';
    if (status.mode === 'synced') {
      if (!status.lastSyncedAt) return '云端已同步';
      const date = new Date(status.lastSyncedAt);
      const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return time ? `已同步 ${time}` : '云端已同步';
    }
    return '本地模式';
  }

  function updateStatus(status) {
    ensureUI();
    const button = document.getElementById('cloudSyncStatusBtn');
    if (!button) return;
    button.textContent = statusText(status);
    button.dataset.mode = status.mode;
    button.title = status.error || status.email || '云同步状态';
  }

  function openLogin() {
    showModal('<div class="comic-label">CLOUD SYNC</div><h2>登录云同步</h2><p>输入邮箱，我们会发送一次性 Magic Link。打开邮件中的链接即可登录。</p><div class="cloud-sync-field"><label>邮箱</label><input class="ws-input" id="cloudSyncEmail" type="email" autocomplete="email" placeholder="name@example.com"></div><div class="cloud-sync-actions"><button class="ws-btn primary" id="cloudSyncSend" type="button">发送登录链接</button></div><div class="cloud-sync-note" id="cloudSyncNote"></div>');
    document.getElementById('cloudSyncSend').onclick = async () => {
      const note = document.getElementById('cloudSyncNote');
      try {
        await root.CloudSync.login(document.getElementById('cloudSyncEmail').value);
        note.textContent = '登录链接已发送，请到邮箱中打开。';
      } catch (error) { note.textContent = error.message || String(error); }
    };
  }

  function openInitialize() {
    showModal('<div class="comic-label">FIRST SYNC</div><h2>初始化云端数据</h2><p>首次初始化只接受已确认的 2026-08-27 主数据备份：<strong>1060 位客户 · 10 个标签 · 0 个工作任务</strong>。其他设备旧数据不会自动上传。</p><div class="cloud-sync-field"><label>主数据 JSON</label><input id="cloudSyncBackupFile" type="file" accept="application/json,.json"></div><div class="cloud-sync-actions"><button class="ws-btn primary" id="cloudSyncInit" type="button">使用此备份初始化</button></div><div class="cloud-sync-note" id="cloudSyncNote"></div>');
    document.getElementById('cloudSyncInit').onclick = async () => {
      const note = document.getElementById('cloudSyncNote');
      const file = document.getElementById('cloudSyncBackupFile').files[0];
      if (!file) { note.textContent = '请选择主数据 JSON'; return; }
      try {
        const payload = JSON.parse(await file.text());
        const summary = root.CloudSync.validateBaseline(payload);
        note.textContent = `校验通过：${summary.users.length} 客户 / ${summary.tags.length} 标签，正在上传…`;
        await root.CloudSync.initializeFromBackup(payload);
        note.textContent = '初始化完成，云端已成为正式数据源。';
        setTimeout(closeModal, 700);
      } catch (error) { note.textContent = error.message || String(error); }
    };
  }

  function openConflicts() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(root.CloudSync.constants.CONFLICT_KEY) || '[]'); } catch (_) {}
    showModal(`<div class="comic-label">CONFLICT</div><h2>${list.length} 项冲突</h2><p>同一条记录已在另一台设备更新。系统不会静默覆盖，请明确选择版本。</p>${list.map(conflict => `<section class="cloud-conflict"><div class="cloud-conflict-title">${safe(conflict.localPayload && conflict.localPayload.number || conflict.id)}</div><details><summary>查看差异</summary><div class="cloud-diff-grid"><div><b>当前设备</b><pre>${safe(JSON.stringify(conflict.localPayload, null, 2))}</pre></div><div><b>云端</b><pre>${safe(JSON.stringify(conflict.remotePayload, null, 2))}</pre></div></div></details><div class="cloud-sync-actions"><button class="ws-btn" type="button" data-cloud-remote="${safe(conflict.conflictId)}">保留云端版本</button><button class="ws-btn primary" type="button" data-cloud-local="${safe(conflict.conflictId)}">保留当前设备版本</button></div></section>`).join('') || '<div class="cloud-sync-note">冲突已处理完。</div>'}`);
    document.querySelectorAll('[data-cloud-remote]').forEach(button => button.onclick = async () => { await root.CloudSync.resolveConflict(button.dataset.cloudRemote, 'remote'); openConflicts(); });
    document.querySelectorAll('[data-cloud-local]').forEach(button => button.onclick = async () => { await root.CloudSync.resolveConflict(button.dataset.cloudLocal, 'local'); openConflicts(); });
  }

  function openAccount(status) {
    showModal(`<div class="comic-label">CLOUD ACCOUNT</div><h2>云同步</h2><div class="cloud-account-row"><span>账号</span><strong>${safe(status.email || '已登录')}</strong></div><div class="cloud-account-row"><span>状态</span><strong>${safe(statusText(status))}</strong></div>${status.pendingCount ? `<div class="cloud-sync-note">还有 ${status.pendingCount} 项本地修改等待上传。</div>` : ''}<div class="cloud-sync-actions"><button class="ws-btn primary" id="cloudSyncNow" type="button">立即同步</button><button class="ws-btn" id="cloudSyncLogout" type="button">退出云同步</button></div><div class="cloud-sync-note" id="cloudSyncNote">${safe(status.error || '')}</div>`);
    document.getElementById('cloudSyncNow').onclick = async () => {
      const note = document.getElementById('cloudSyncNote');
      note.textContent = '同步中…';
      const next = await root.CloudSync.manualSync();
      note.textContent = statusText(next);
    };
    document.getElementById('cloudSyncLogout').onclick = async () => { await root.CloudSync.logout(); closeModal(); };
  }

  function openStatusAction() {
    const status = root.CloudSync.getStatus();
    if (status.mode === 'signed_out') return openLogin();
    if (status.mode === 'needs_init') return openInitialize();
    if (status.mode === 'conflict') return openConflicts();
    if (status.mode === 'local') {
      showModal('<div class="comic-label">LOCAL MODE</div><h2>当前为本地模式</h2><p>云同步客户端尚未连接。现有 CRM 数据仍完整保存在本机，不会被清空。</p>');
      return;
    }
    openAccount(status);
  }

  function installIntegration() {
    if (!root.CloudSync || root.__cloudSyncIntegrationInstalled) return;
    root.__cloudSyncIntegrationInstalled = true;
    wrapLegacySave('saveData', 'customers');
    wrapLegacySave('saveTags', 'tags');
    installTaskStorageBridge();
    installBackupOverrides();
    root.CloudSync.onStoreApplied(({ type }) => refreshLegacy(type));
    ensureUI();
    root.CloudSync.onStatus(updateStatus);
  }

  async function boot() {
    if (!root.CloudSync) return;
    installIntegration();
    const host = root.location && root.location.hostname ? root.location.hostname : '';
    const isLocalTest = host === '127.0.0.1' || host === 'localhost';
    if (!isLocalTest) {
      try {
        const module = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        root.supabase = { createClient: module.createClient };
      } catch (error) { console.error('Cloud sync client failed to load', error); }
    }
    await root.CloudSync.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
