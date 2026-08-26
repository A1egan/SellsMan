(function() {
  'use strict';

  const core = globalThis.WorkspaceV2Core;
  if (!core) return;

  const TASKS_KEY = 'sales_work_tasks_v1';
  const SIDEBAR_KEY = 'sales_workspace_sidebar_v1';
  const RECENTS_KEY = 'sales_recent_customers_v1';
  const ROUTE_META = {
    home: ['今日作战台', '今天先处理重要的事，剩下的交给系统记住', 'TODAY OPS'],
    tasks: ['今日任务', '处理 CRM 自动提醒的跟进队列', 'CRM QUEUE'],
    board: ['客户看板', '全局浏览、拖拽分层与阶段管理', 'CUSTOMER BOARD'],
    search: ['客户搜索', '快速定位学生，不再从客户墙里翻找', 'FIND CUSTOMER'],
    analytics: ['数据统计', '只看影响销售执行的关键指标', 'OPS SIGNAL'],
    batch: ['批量运营', '集中处理标签、移动、导入、导出与备份', 'BATCH OPS'],
  };

  const state = {
    route: core.normalizeRoute(location.hash),
    collapsed: localStorage.getItem(SIDEBAR_KEY) === '1',
    workTasks: [],
    searchQuery: '',
    taskStageFilter: '',
    taskTagFilter: '',
    dragTaskId: '',
    dragGroup: '',
    editingTaskId: '',
    workspaceReady: false,
  };

  let legacyRender = typeof render === 'function' ? render : null;
  let legacyOpenTagModal = typeof openTagModal === 'function' ? openTagModal : null;

  const safe = value => {
    if (typeof escapeHtml === 'function') return escapeHtml(String(value == null ? '' : value));
    const div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  };

  const todayKey = () => core.dateKey(new Date());
  const tomorrowKey = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return core.dateKey(d);
  };

  function toast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function getUser(id) {
    return Array.isArray(users) ? users.find(u => u.id === id) : null;
  }

  function getColumnName(id) {
    const col = Array.isArray(COLUMNS) ? COLUMNS.find(c => c.id === id) : null;
    return col ? col.name : id || '';
  }

  function getTagNames(user) {
    return (user && Array.isArray(user.tags) ? user.tags : [])
      .map(id => typeof getTag === 'function' ? getTag(id) : (Array.isArray(tags) ? tags.find(t => t.id === id) : null))
      .filter(Boolean)
      .map(t => t.name);
  }

  function loadWorkTasks() {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) {
      state.workTasks = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      state.workTasks = Array.isArray(parsed) ? parsed.map(core.normalizeTask) : [];
    } catch (e) {
      state.workTasks = [];
    }
  }

  function saveWorkTasks() {
    state.workTasks = state.workTasks.map(core.normalizeTask);
    localStorage.setItem(TASKS_KEY, JSON.stringify(state.workTasks));
    updateSidebarCounts();
  }

  function loadRecentIds() {
    try {
      const value = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch (e) {
      return [];
    }
  }

  function trackRecentCustomer(userId) {
    const id = String(userId || '');
    if (!id) return;
    const next = [id, ...loadRecentIds().filter(x => x !== id)].slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    if (state.route === 'home') renderHome();
  }

  function recentUsers() {
    return loadRecentIds().map(getUser).filter(Boolean);
  }

  function buildShell() {
    const legacyHeader = document.querySelector('body > .header');
    const legacyTaskBar = document.getElementById('taskBar');
    const legacyTagBar = document.getElementById('tagFilterBar');
    const legacyBoard = document.getElementById('board');
    if (!legacyHeader || !legacyBoard) return false;

    const shell = document.createElement('div');
    shell.className = 'workspace-shell' + (state.collapsed ? ' sidebar-collapsed' : '');
    shell.id = 'workspaceShell';
    shell.innerHTML = `
      <aside class="workspace-sidebar" id="workspaceSidebar">
        <div class="workspace-brand">
          <div class="workspace-brand-mark">A1</div>
          <div class="workspace-brand-name">A1eG4n 工作台</div>
          <div class="workspace-brand-sub">MODERN COMIC OPS</div>
        </div>
        <nav class="workspace-nav">
          ${navButton('home','NOW','今日作战台')}
          ${navButton('tasks','CRM','今日任务')}
          ${navButton('board','KAN','客户看板')}
          ${navButton('search','FND','客户搜索')}
          ${navButton('analytics','SIG','数据统计')}
          ${navButton('batch','OPS','批量运营')}
        </nav>
        <div class="workspace-sidebar-foot">
          <div class="workspace-side-actions">
            <button class="workspace-side-action" type="button" data-side-action="backup"><span>备份</span></button>
            <button class="workspace-side-action" type="button" data-side-action="export"><span>导出</span></button>
          </div>
          <button class="workspace-collapse-btn" id="workspaceCollapseBtn" type="button">
            <span class="workspace-collapse-label">收起导航</span><span>${state.collapsed ? '→' : '←'}</span>
          </button>
        </div>
      </aside>
      <main class="workspace-main">
        <header class="workspace-topbar">
          <div class="workspace-page-meta">
            <div class="workspace-page-kicker" id="workspacePageKicker"></div>
            <div class="workspace-page-title" id="workspacePageTitle"></div>
            <div class="workspace-page-subtitle" id="workspacePageSubtitle"></div>
          </div>
          <div class="workspace-topbar-actions">
            <input class="workspace-quick-search" id="workspaceQuickSearch" placeholder="输入学员编号 / 备注 / 标签，Enter 搜索">
            <button class="ws-btn primary" id="workspaceAddTaskBtn" type="button">+ 今日任务</button>
          </div>
        </header>
        <div class="workspace-view-stack" id="workspaceViewStack">
          ${view('home')}${view('tasks')}${view('board')}${view('search')}${view('analytics')}${view('batch')}
        </div>
      </main>`;

    document.body.insertBefore(shell, legacyHeader);
    const boardView = shell.querySelector('[data-view="board"]');
    boardView.appendChild(legacyHeader);
    if (legacyTaskBar) boardView.appendChild(legacyTaskBar);
    if (legacyTagBar) boardView.appendChild(legacyTagBar);
    boardView.appendChild(legacyBoard);

    document.body.classList.add('workspace-v2-ready');
    const tagModal = document.getElementById('tagModal');
    if (tagModal) tagModal.classList.add('customer-drawer');
    buildOwnedModals();
    wireChrome();
    return true;
  }

  function navButton(route, icon, label) {
    return `<button class="workspace-nav-btn" type="button" data-route="${route}" title="${label}">
      <span class="workspace-nav-icon">${icon}</span>
      <span class="workspace-nav-label">${label}</span>
      <span class="workspace-nav-count" data-nav-count="${route}"></span>
    </button>`;
  }

  function view(name) {
    return `<section class="workspace-view" data-view="${name}" id="workspaceView-${name}"></section>`;
  }

  function buildOwnedModals() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="ws-modal-overlay" id="wsTaskModal" onclick="if(event.target===this) WorkspaceV2.closeTaskEditor()">
        <div class="ws-modal">
          <div class="comic-label">WORK ITEM</div>
          <h2 id="wsTaskModalTitle">新建任务</h2>
          <div class="ws-field"><label>任务内容</label><input class="ws-input" id="wsTaskTitle" maxlength="120" placeholder="例如：回访99体验高意向用户"></div>
          <div class="ws-field"><label>优先级</label><select class="ws-select" id="wsTaskPriority"><option value="normal">普通</option><option value="important">重要</option><option value="urgent">紧急</option></select></div>
          <div class="ws-field"><label>计划日期</label><input class="ws-input" id="wsTaskDate" type="date"></div>
          <div class="ws-field"><label>关联学员（可选）</label><input class="ws-input" id="wsTaskCustomer" list="wsCustomerList" placeholder="输入学员编号"><datalist id="wsCustomerList"></datalist></div>
          <div class="ws-modal-actions"><button class="ws-btn ghost" type="button" onclick="WorkspaceV2.closeTaskEditor()">取消</button><button class="ws-btn primary" type="button" onclick="WorkspaceV2.saveTaskEditor()">保存</button></div>
        </div>
      </div>
      <div class="ws-modal-overlay" id="wsRolloverModal" onclick="if(event.target===this) WorkspaceV2.closeRolloverSelector()">
        <div class="ws-modal">
          <div class="comic-label">ROLLOVER</div>
          <h2>选择转入今日</h2>
          <div class="rollover-select-list" id="wsRolloverList"></div>
          <div class="ws-modal-actions"><button class="ws-btn ghost" type="button" onclick="WorkspaceV2.closeRolloverSelector()">取消</button><button class="ws-btn primary" type="button" onclick="WorkspaceV2.confirmSelectedRollover()">转入选中</button></div>
        </div>
      </div>`;
    while (wrapper.firstElementChild) document.body.appendChild(wrapper.firstElementChild);
  }

  function wireChrome() {
    document.querySelectorAll('.workspace-nav-btn').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
    document.getElementById('workspaceCollapseBtn').addEventListener('click', toggleSidebar);
    document.querySelectorAll('[data-side-action]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.sideAction === 'backup' && typeof backupData === 'function') backupData();
      if (btn.dataset.sideAction === 'export' && typeof exportData === 'function') exportData();
    }));
    document.getElementById('workspaceAddTaskBtn').addEventListener('click', () => openTaskEditor('active'));
    document.getElementById('workspaceQuickSearch').addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      state.searchQuery = event.currentTarget.value.trim();
      navigate('search');
    });
    addEventListener('hashchange', () => {
      state.route = core.normalizeRoute(location.hash);
      renderCurrentView();
    });
  }

  function wrapLegacyFunctions() {
    if (legacyOpenTagModal) {
      openTagModal = function(userId) {
        trackRecentCustomer(userId);
        return legacyOpenTagModal(userId);
      };
    }
    if (legacyRender) {
      render = function() {
        const result = legacyRender();
        if (state.workspaceReady) {
          updateSidebarCounts();
          if (state.route !== 'board') renderCurrentView();
        }
        return result;
      };
    }
  }

  function toggleSidebar() {
    state.collapsed = !state.collapsed;
    localStorage.setItem(SIDEBAR_KEY, state.collapsed ? '1' : '0');
    const shell = document.getElementById('workspaceShell');
    shell.classList.toggle('sidebar-collapsed', state.collapsed);
    const btn = document.getElementById('workspaceCollapseBtn');
    btn.querySelector('.workspace-collapse-label').textContent = state.collapsed ? '展开导航' : '收起导航';
    btn.lastElementChild.textContent = state.collapsed ? '→' : '←';
  }

  function navigate(route) {
    const clean = core.normalizeRoute('#' + route);
    if (location.hash !== '#' + clean) location.hash = '#' + clean;
    else {
      state.route = clean;
      renderCurrentView();
    }
  }

  function renderTopbar() {
    const meta = ROUTE_META[state.route] || ROUTE_META.home;
    document.getElementById('workspacePageTitle').textContent = meta[0];
    document.getElementById('workspacePageSubtitle').textContent = meta[1];
    document.getElementById('workspacePageKicker').textContent = meta[2];
    const search = document.getElementById('workspaceQuickSearch');
    if (state.route === 'search') search.value = state.searchQuery;
  }

  function renderCurrentView() {
    state.route = core.normalizeRoute(location.hash);
    document.querySelectorAll('.workspace-view').forEach(el => el.classList.toggle('active', el.dataset.view === state.route));
    document.querySelectorAll('.workspace-nav-btn').forEach(el => el.classList.toggle('active', el.dataset.route === state.route));
    renderTopbar();
    updateSidebarCounts();
    if (state.route === 'home') renderHome();
    if (state.route === 'tasks') renderTasksView();
    if (state.route === 'board' && legacyRender) legacyRender();
    if (state.route === 'search') renderSearchView();
    if (state.route === 'analytics') renderAnalyticsView();
    if (state.route === 'batch') renderBatchView();
  }

  function updateSidebarCounts() {
    if (!state.workspaceReady) return;
    const activePersonal = state.workTasks.filter(t => t.status === 'active').length;
    const crmDue = Array.isArray(users) ? users.filter(u => ['overdue','today'].includes(typeof getFollowupStatus === 'function' ? getFollowupStatus(u) : '')).length : 0;
    const values = { home: activePersonal, tasks: crmDue, board: Array.isArray(users) ? users.length : 0, search: '', analytics: '', batch: '' };
    document.querySelectorAll('[data-nav-count]').forEach(el => { el.textContent = values[el.dataset.navCount] === '' ? '' : values[el.dataset.navCount]; });
  }

  function renderHome() {
    const viewEl = document.getElementById('workspaceView-home');
    if (!viewEl) return;
    const parts = core.partitionTasks(state.workTasks, todayKey());
    const active = parts.active;
    const todayCompleted = parts.completed.filter(t => core.dateKey(t.completedAt) === todayKey());
    const futurePlanned = parts.planned;
    const rollover = parts.rollover;
    const overdue = users.filter(u => getFollowupStatus(u) === 'overdue').length;
    const dueToday = users.filter(u => getFollowupStatus(u) === 'today').length;
    const high = users.filter(u => u.column === 'contacting').length;
    const effective = typeof countEffectiveToday === 'function' ? countEffectiveToday() : 0;
    const d = new Date();
    const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];

    viewEl.innerHTML = `<div class="workspace-content">
      <div class="home-hero">
        <div><div class="comic-label">MISSION CONTROL</div><div class="home-date">${d.getMonth()+1}.${String(d.getDate()).padStart(2,'0')}<small>${d.getFullYear()} · ${weekdays[d.getDay()]}</small></div></div>
        <div class="home-status-line">今日 ${active.length} 项个人任务 · ${overdue} 位学员逾期 · 有效沟通 ${effective}/20</div>
      </div>
      ${rollover.length ? rolloverBanner(rollover) : ''}
      <div class="home-grid">
        <div class="home-main-column">
          <section class="ws-panel">
            <div class="ws-panel-head"><div><div class="ws-panel-title">今日计划</div><div class="ws-panel-note">你自己决定今天最重要的工作</div></div><div class="ws-panel-actions"><button class="ws-btn small" type="button" onclick="WorkspaceV2.openTaskEditor('active')">+ 详细任务</button></div></div>
            <div class="task-compose"><input id="quickTaskTitle" placeholder="快速记一件今天要做的事"><select id="quickTaskPriority"><option value="normal">普通</option><option value="important">重要</option><option value="urgent">紧急</option></select><button class="ws-btn primary" type="button" onclick="WorkspaceV2.quickAddTask()">加入今日</button></div>
            <div class="ws-panel-body"><div class="work-task-list" data-task-group="active">${renderWorkTaskRows(active, 'active')}</div>${todayCompleted.length ? `<details class="completed-details"><summary>今日已完成 ${todayCompleted.length} 项</summary><div class="work-task-list" style="margin-top:6px">${renderWorkTaskRows(todayCompleted, 'completed')}</div></details>` : ''}</div>
          </section>
          <div class="home-lower-grid">
            <section class="ws-panel"><div class="ws-panel-head"><div><div class="ws-panel-title">明日计划</div><div class="ws-panel-note">先计划，明天再决定是否接入今日</div></div><div class="ws-panel-actions"><button class="ws-btn small" type="button" onclick="WorkspaceV2.openTaskEditor('planned')">+ 明日任务</button></div></div><div class="ws-panel-body"><div class="work-task-list" data-task-group="planned">${renderWorkTaskRows(futurePlanned.slice(0,8), 'planned')}</div></div></section>
            <section class="ws-panel"><div class="ws-panel-head"><div><div class="ws-panel-title">最近处理</div><div class="ws-panel-note">继续刚才的沟通上下文</div></div></div><div class="ws-panel-body"><div class="recent-customers">${renderRecentCustomers()}</div></div></section>
          </div>
        </div>
        <aside class="home-side-column">
          <section class="ws-panel"><div class="ws-panel-head"><div><div class="ws-panel-title">CRM 雷达</div><div class="ws-panel-note">系统提醒你现在最该关注谁</div></div></div><div class="ws-panel-body crm-radar">
            ${radarItem('red','LATE','逾期跟进','已经超过约定时间',overdue,"WorkspaceV2.openCrmQueue('overdue')")}
            ${radarItem('orange','NOW','今日待跟进','今天约定需要联系',dueToday,"WorkspaceV2.openCrmQueue('today')")}
            ${radarItem('purple','HOT','高意向待处理','当前高意向池客户',high,"WorkspaceV2.openHighIntent()")}
            ${radarEffective(effective)}
          </div></section>
        </aside>
      </div>
    </div>`;
    wireTaskDrag(viewEl);
  }

  function rolloverBanner(tasks) {
    return `<div class="rollover-banner"><strong>昨日/到期计划有 ${tasks.length} 项待处理</strong><span>不会自动塞进今日，由你决定。</span><div class="rollover-actions"><button class="ws-btn small" onclick="WorkspaceV2.rolloverAll()">全部转入今日</button><button class="ws-btn small" onclick="WorkspaceV2.openRolloverSelector()">选择转入</button><button class="ws-btn small ghost" onclick="WorkspaceV2.deferRollover()">暂不处理</button></div></div>`;
  }

  function radarItem(cls, icon, label, hint, value, action) {
    return `<div class="radar-item ${cls}" onclick="${action}"><span class="radar-icon">${icon}</span><span><div class="radar-label">${label}</div><div class="radar-hint">${hint}</div></span><strong class="radar-value">${value}</strong></div>`;
  }

  function radarEffective(value) {
    const pct = Math.max(0, Math.min(100, value / 20 * 100));
    return `<div class="radar-item green" onclick="WorkspaceV2.navigate('analytics')"><span class="radar-icon">KPI</span><span><div class="radar-label">今日有效沟通</div><div class="radar-hint">目标 20 次<div class="radar-progress"><span style="width:${pct}%"></span></div></div></span><strong class="radar-value">${value}<small style="font-size:9px">/20</small></strong></div>`;
  }

  function renderWorkTaskRows(list, group) {
    if (!list.length) return `<div class="ws-empty">${group === 'planned' ? '还没有明日计划' : group === 'completed' ? '暂无已完成任务' : '今日计划为空，先写下最重要的一件事'}</div>`;
    return list.map(task => {
      const user = task.linkedCustomerId ? getUser(task.linkedCustomerId) : null;
      const priorityLabel = { normal:'普通', important:'重要', urgent:'紧急' }[task.priority] || '普通';
      const completed = task.status === 'completed';
      return `<div class="work-task-row ${completed ? 'completed' : ''}" data-task-id="${safe(task.id)}" data-task-group="${group}" data-priority="${task.priority}" draggable="${completed ? 'false' : 'true'}">
        <input class="work-task-check" type="checkbox" ${completed ? 'checked' : ''} onchange="WorkspaceV2.toggleWorkTask('${safe(task.id)}', this.checked)">
        <div><div class="work-task-title">${safe(task.title || '未命名任务')}</div><div class="work-task-meta"><span>${priorityLabel}</span><span>${safe(task.plannedDate)}</span>${user ? `<button class="customer-chip" type="button" onclick="event.stopPropagation();WorkspaceV2.openCustomer('${safe(user.id)}')">#${safe(user.number)}</button>` : ''}</div></div>
        <div class="work-task-ops"><span class="task-drag-handle" title="拖拽排序">⋮⋮</span><button class="task-icon-btn" type="button" onclick="WorkspaceV2.openTaskEditor('${task.status === 'planned' ? 'planned' : 'active'}','${safe(task.id)}')">改</button><button class="task-icon-btn" type="button" onclick="WorkspaceV2.deleteWorkTask('${safe(task.id)}')">删</button></div>
      </div>`;
    }).join('');
  }

  function renderRecentCustomers() {
    const list = recentUsers();
    if (!list.length) return '<div class="ws-empty">还没有最近处理记录</div>';
    return list.map(user => `<div class="recent-customer" onclick="WorkspaceV2.openCustomer('${safe(user.id)}')"><span class="recent-avatar">ID</span><span><div class="recent-number">#${safe(user.number)}</div><div class="ws-panel-note">${safe(getColumnName(user.column))}${user.nextAction ? ' · ' + safe(user.nextAction) : ''}</div></span><span class="recent-meta">${typeof formatTime === 'function' ? safe(formatTime(user.updatedAt || Date.now())) : ''}</span></div>`).join('');
  }

  function quickAddTask() {
    const titleEl = document.getElementById('quickTaskTitle');
    const priorityEl = document.getElementById('quickTaskPriority');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) { toast('先写任务内容'); return; }
    const maxOrder = state.workTasks.reduce((m,t) => Math.max(m, Number(t.sortOrder || 0)), 0);
    state.workTasks.push(core.createTask({ title, plannedDate: todayKey(), priority: priorityEl.value, status: 'active', sortOrder: maxOrder + 10 }, Date.now()));
    saveWorkTasks();
    titleEl.value = '';
    renderHome();
    toast('已加入今日计划');
  }

  function openTaskEditor(mode, taskId) {
    const modal = document.getElementById('wsTaskModal');
    state.editingTaskId = taskId || '';
    const task = taskId ? state.workTasks.find(t => t.id === taskId) : null;
    document.getElementById('wsTaskModalTitle').textContent = task ? '编辑任务' : (mode === 'planned' ? '新建明日任务' : '新建今日任务');
    document.getElementById('wsTaskTitle').value = task ? task.title : '';
    document.getElementById('wsTaskPriority').value = task ? task.priority : 'normal';
    document.getElementById('wsTaskDate').value = task ? task.plannedDate : (mode === 'planned' ? tomorrowKey() : todayKey());
    const linked = task && task.linkedCustomerId ? getUser(task.linkedCustomerId) : null;
    document.getElementById('wsTaskCustomer').value = linked ? linked.number : '';
    document.getElementById('wsCustomerList').innerHTML = users.slice().sort((a,b) => String(a.number).localeCompare(String(b.number), undefined, {numeric:true})).map(u => `<option value="${safe(u.number)}"></option>`).join('');
    modal.dataset.mode = mode;
    modal.classList.add('show');
    setTimeout(() => document.getElementById('wsTaskTitle').focus(), 30);
  }

  function closeTaskEditor() {
    document.getElementById('wsTaskModal').classList.remove('show');
    state.editingTaskId = '';
  }

  function saveTaskEditor() {
    const modal = document.getElementById('wsTaskModal');
    const title = document.getElementById('wsTaskTitle').value.trim();
    const priority = document.getElementById('wsTaskPriority').value;
    const plannedDate = document.getElementById('wsTaskDate').value || (modal.dataset.mode === 'planned' ? tomorrowKey() : todayKey());
    const customerValue = document.getElementById('wsTaskCustomer').value.trim();
    if (!title) { toast('请输入任务内容'); return; }
    let linkedCustomerId = '';
    if (customerValue) {
      const found = users.find(u => String(u.number) === customerValue || String(u.id) === customerValue);
      if (!found) { toast('没有找到这个学员编号'); return; }
      linkedCustomerId = found.id;
    }
    const existing = state.editingTaskId ? state.workTasks.find(t => t.id === state.editingTaskId) : null;
    if (existing) {
      state.workTasks = state.workTasks.map(t => t.id === existing.id ? core.normalizeTask({ ...t, title, priority, plannedDate, linkedCustomerId }) : t);
    } else {
      const status = modal.dataset.mode === 'planned' ? 'planned' : 'active';
      const maxOrder = state.workTasks.reduce((m,t) => Math.max(m, Number(t.sortOrder || 0)), 0);
      state.workTasks.push(core.createTask({ title, priority, plannedDate, linkedCustomerId, status, sortOrder: maxOrder + 10 }, Date.now()));
    }
    saveWorkTasks();
    closeTaskEditor();
    renderCurrentView();
    toast('任务已保存');
  }

  function deleteWorkTask(id) {
    state.workTasks = state.workTasks.filter(t => t.id !== id);
    saveWorkTasks();
    renderCurrentView();
    toast('任务已删除');
  }

  function toggleWorkTask(id, checked) {
    state.workTasks = checked ? core.completeTasks(state.workTasks, [id], Date.now()) : core.reopenTasks(state.workTasks, [id], Date.now());
    saveWorkTasks();
    renderCurrentView();
  }

  function rolloverCandidates() {
    return core.getRolloverCandidates(state.workTasks, todayKey());
  }

  function rolloverAll() {
    const ids = rolloverCandidates().map(t => t.id);
    state.workTasks = core.activateTasks(state.workTasks, ids, Date.now());
    saveWorkTasks();
    renderHome();
    toast(`已转入今日 ${ids.length} 项`);
  }

  function deferRollover() {
    const ids = rolloverCandidates().map(t => t.id);
    state.workTasks = core.deferTasks(state.workTasks, ids, Date.now());
    saveWorkTasks();
    renderHome();
    toast('已暂缓这些计划');
  }

  function openRolloverSelector() {
    const list = rolloverCandidates();
    document.getElementById('wsRolloverList').innerHTML = list.map(t => `<label class="rollover-select-row"><input type="checkbox" value="${safe(t.id)}" checked><span><strong>${safe(t.title)}</strong><br><small>${safe(t.plannedDate)}</small></span></label>`).join('');
    document.getElementById('wsRolloverModal').classList.add('show');
  }

  function closeRolloverSelector() { document.getElementById('wsRolloverModal').classList.remove('show'); }

  function confirmSelectedRollover() {
    const ids = Array.from(document.querySelectorAll('#wsRolloverList input:checked')).map(el => el.value);
    if (!ids.length) { toast('至少选择一项'); return; }
    state.workTasks = core.activateTasks(state.workTasks, ids, Date.now());
    saveWorkTasks();
    closeRolloverSelector();
    renderHome();
    toast(`已转入今日 ${ids.length} 项`);
  }

  function wireTaskDrag(scope) {
    scope.querySelectorAll('.work-task-row[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', () => {
        state.dragTaskId = row.dataset.taskId;
        state.dragGroup = row.dataset.taskGroup;
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', e => e.preventDefault());
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (!state.dragTaskId || state.dragGroup !== row.dataset.taskGroup || state.dragTaskId === row.dataset.taskId) return;
        reorderTask(state.dragTaskId, row.dataset.taskId, row.dataset.taskGroup);
      });
    });
  }

  function reorderTask(sourceId, targetId, group) {
    const ids = core.sortTasks(state.workTasks.filter(t => (group === 'planned' ? t.status === 'planned' : t.status === 'active'))).map(t => t.id);
    const from = ids.indexOf(sourceId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    const order = new Map(ids.map((id, index) => [id, (index + 1) * 10]));
    state.workTasks = state.workTasks.map(t => order.has(t.id) ? core.normalizeTask({ ...t, sortOrder: order.get(t.id) }) : t);
    saveWorkTasks();
    renderCurrentView();
  }

  function openCustomer(userId) {
    if (typeof openTagModal === 'function') openTagModal(userId);
  }

  function openCrmQueue(filter) {
    if (typeof setTaskFilter === 'function') setTaskFilter(filter);
    state.taskStageFilter = '';
    navigate('tasks');
  }

  function openHighIntent() {
    state.taskStageFilter = 'contacting';
    navigate('tasks');
  }

  function renderTasksView() {
    const viewEl = document.getElementById('workspaceView-tasks');
    const stageOptions = `<option value="">全部阶段</option>${COLUMNS.map(c => `<option value="${safe(c.id)}" ${state.taskStageFilter === c.id ? 'selected' : ''}>${safe(c.name)}</option>`).join('')}`;
    const tagOptions = `<option value="">全部标签</option>${tags.map(t => `<option value="${safe(t.id)}" ${state.taskTagFilter === t.id ? 'selected' : ''}>${safe(t.name)}</option>`).join('')}`;
    const filtered = users.filter(u => (!state.taskStageFilter || u.column === state.taskStageFilter) && (!state.taskTagFilter || (u.tags || []).includes(state.taskTagFilter)));
    const soonCutoff = Date.now() + 3 * 86400000;
    const groups = [
      ['逾期', filtered.filter(u => getFollowupStatus(u) === 'overdue')],
      ['今日', filtered.filter(u => getFollowupStatus(u) === 'today')],
      ['即将到期', filtered.filter(u => getFollowupStatus(u) === 'future' && Number(u.nextFollowUpAt || 0) <= soonCutoff)],
      ['未安排', filtered.filter(u => getFollowupStatus(u) === 'unscheduled')],
    ];
    viewEl.innerHTML = `<div class="task-system-toolbar"><select class="ws-select" id="wsTaskStageFilter">${stageOptions}</select><select class="ws-select" id="wsTaskTagFilter">${tagOptions}</select><span class="ws-count-note">优先处理逾期和今日，再看即将到期</span></div><div class="crm-task-groups">${groups.map(([name,list]) => `<section class="ws-panel crm-task-group"><div class="ws-panel-head"><div class="ws-panel-title">${name}</div><span class="ws-count-note">${list.length}</span></div><div class="ws-panel-body crm-task-list">${renderCrmTaskRows(list.slice(0,80))}</div></section>`).join('')}</div>`;
    document.getElementById('wsTaskStageFilter').addEventListener('change', e => { state.taskStageFilter = e.target.value; renderTasksView(); });
    document.getElementById('wsTaskTagFilter').addEventListener('change', e => { state.taskTagFilter = e.target.value; renderTasksView(); });
  }

  function renderCrmTaskRows(list) {
    if (!list.length) return '<div class="ws-empty">暂无学员</div>';
    return list.map(u => `<div class="crm-task-row" onclick="WorkspaceV2.openCustomer('${safe(u.id)}')"><div><div class="crm-task-number">#${safe(u.number)}</div><div class="ws-panel-note">${safe(getColumnName(u.column))}</div></div><div class="crm-task-action">${safe(u.nextAction || u.note || '未记录下一步')}</div><div class="crm-task-time">${u.nextFollowUpAt ? safe(formatFollowupDate(u.nextFollowUpAt)) : '未安排'}</div></div>`).join('');
  }

  function renderSearchView() {
    const viewEl = document.getElementById('workspaceView-search');
    viewEl.innerHTML = `<div class="search-toolbar"><input class="ws-input" id="wsSearchInput" value="${safe(state.searchQuery)}" placeholder="搜索编号、备注、标签"><span class="ws-count-note" id="wsSearchCount"></span></div><div class="search-results" id="wsSearchResults"></div>`;
    const input = document.getElementById('wsSearchInput');
    input.addEventListener('input', () => { state.searchQuery = input.value.trim(); renderSearchResults(); });
    renderSearchResults();
    setTimeout(() => input.focus(), 20);
  }

  function renderSearchResults() {
    const box = document.getElementById('wsSearchResults');
    const countEl = document.getElementById('wsSearchCount');
    if (!box) return;
    const q = state.searchQuery.toLowerCase();
    let list;
    if (!q) {
      list = recentUsers();
      countEl.textContent = list.length ? '未输入关键词，显示最近处理' : '';
    } else {
      list = users.filter(u => {
        const tagText = getTagNames(u).join(' ').toLowerCase();
        return String(u.number).toLowerCase().includes(q) || String(u.note || '').toLowerCase().includes(q) || tagText.includes(q);
      });
      countEl.textContent = `找到 ${list.length} 位，最多显示 80 位`;
    }
    const visible = list.slice(0, 80);
    box.innerHTML = visible.length ? visible.map(u => `<div class="search-result-card" onclick="WorkspaceV2.openCustomer('${safe(u.id)}')"><div><span class="search-result-number">#${safe(u.number)}</span><span class="search-result-stage">${safe(getColumnName(u.column))}</span></div><div class="search-result-note">${safe(u.note || u.nextAction || '暂无备注')}</div><div class="search-result-tags">${getTagNames(u).slice(0,5).map(n => `<span class="search-tag">${safe(n)}</span>`).join('')}</div></div>`).join('') : '<div class="ws-empty">没有匹配的学员</div>';
  }

  function renderAnalyticsView() {
    const viewEl = document.getElementById('workspaceView-analytics');
    const stageCounts = COLUMNS.map(c => ({ name: c.name, value: users.filter(u => u.column === c.id).length }));
    const maxStage = Math.max(1, ...stageCounts.map(x => x.value));
    const overdue = users.filter(u => getFollowupStatus(u) === 'overdue').length;
    const dueToday = users.filter(u => getFollowupStatus(u) === 'today').length;
    const effective = countEffectiveToday();
    const activeTasks = state.workTasks.filter(t => t.status === 'active').length;
    const completedToday = state.workTasks.filter(t => t.status === 'completed' && core.dateKey(t.completedAt) === todayKey()).length;
    const tagCounts = tags.map(t => ({ name:t.name, value:users.filter(u => (u.tags||[]).includes(t.id)).length })).sort((a,b)=>b.value-a.value).slice(0,6);
    const maxTag = Math.max(1, ...tagCounts.map(x => x.value));
    viewEl.innerHTML = `<div class="analytics-summary"><div class="analytics-kpis">${kpi('今日有效沟通', effective, '/20')}${kpi('逾期学员', overdue, '')}${kpi('今日待跟进', dueToday, '')}${kpi('今日完成任务', completedToday, '')}</div><div class="analytics-bars"><section class="ws-panel"><div class="ws-panel-head"><div class="ws-panel-title">客户阶段</div><span class="ws-count-note">总计 ${users.length}</span></div><div class="ws-panel-body">${stageCounts.map(x=>barRow(x.name,x.value,maxStage,'var(--ws-purple)')).join('')}</div></section><section class="ws-panel"><div class="ws-panel-head"><div class="ws-panel-title">标签 / 来源</div><span class="ws-count-note">当前个人任务 ${activeTasks}</span></div><div class="ws-panel-body">${tagCounts.length ? tagCounts.map(x=>barRow(x.name,x.value,maxTag,'var(--ws-orange)')).join('') : '<div class="ws-empty">暂无标签数据</div>'}</div></section></div></div>`;
  }

  function kpi(label, value, suffix) {
    return `<div class="analytics-kpi"><div class="analytics-kpi-label">${safe(label)}</div><div class="analytics-kpi-value">${value}<small style="font-size:10px">${suffix}</small></div></div>`;
  }

  function barRow(label, value, max, color) {
    return `<div class="analytics-bar-row"><span>${safe(label)}</span><div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${Math.max(3,value/max*100)}%;background:${color}"></div></div><strong>${value}</strong></div>`;
  }

  function renderBatchView() {
    const viewEl = document.getElementById('workspaceView-batch');
    viewEl.innerHTML = `<div class="batch-grid">
      ${batchCard('批量选择','进入客户看板后选择多人，统一移动或删除。','select','开始选择')}
      ${batchCard('批量添加','打开原有批量导入区域，可指定标签与栏目。','add','添加客户')}
      ${batchCard('导出 CSV','保持原 CSV 字段语义，导出当前客户数据。','export','导出 CSV')}
      ${batchCard('完整备份','下载现有客户与标签 JSON 备份。','backup','备份数据')}
      ${batchCard('导入客户','从 CSV / TXT 导入新客户，重复编号自动跳过。','import','选择文件')}
      ${batchCard('恢复备份','从 JSON 备份恢复客户和标签，执行前仍会二次确认。','restore','选择备份')}
      <input id="wsImportFile" type="file" accept=".csv,.txt" hidden><input id="wsRestoreFile" type="file" accept=".json" hidden>
    </div>`;
    document.querySelectorAll('[data-batch-action]').forEach(btn => btn.addEventListener('click', () => batchAction(btn.dataset.batchAction)));
    document.getElementById('wsImportFile').addEventListener('change', e => importFile(e));
    document.getElementById('wsRestoreFile').addEventListener('change', e => restoreData(e));
  }

  function batchCard(title, text, action, label) {
    return `<section class="batch-action-card"><div class="comic-label">OPS</div><h3>${safe(title)}</h3><p>${safe(text)}</p><button class="ws-btn" type="button" data-batch-action="${action}">${safe(label)}</button></section>`;
  }

  function batchAction(action) {
    if (action === 'select') {
      navigate('board');
      setTimeout(() => { if (!batchMode) toggleBatchMode(); }, 30);
    }
    if (action === 'add') {
      navigate('board');
      setTimeout(() => showBatchAdd(), 30);
    }
    if (action === 'export') exportData();
    if (action === 'backup') backupData();
    if (action === 'import') document.getElementById('wsImportFile').click();
    if (action === 'restore') document.getElementById('wsRestoreFile').click();
  }

  function initWorkspace() {
    if (document.body.dataset.workspaceV2 === '1') return;
    document.body.dataset.workspaceV2 = '1';
    loadWorkTasks();
    if (!buildShell()) return;
    wrapLegacyFunctions();
    state.workspaceReady = true;
    if (!location.hash || core.normalizeRoute(location.hash) === 'home' && location.hash !== '#home') {
      history.replaceState(null, '', location.pathname + location.search + '#home');
    }
    state.route = core.normalizeRoute(location.hash);
    renderCurrentView();
  }

  globalThis.WorkspaceV2 = {
    navigate,
    toggleSidebar,
    renderCurrentView,
    openTaskEditor,
    closeTaskEditor,
    saveTaskEditor,
    quickAddTask,
    deleteWorkTask,
    toggleWorkTask,
    rolloverAll,
    deferRollover,
    openRolloverSelector,
    closeRolloverSelector,
    confirmSelectedRollover,
    openCustomer,
    openCrmQueue,
    openHighIntent,
    batchAction,
    loadWorkTasks,
    saveWorkTasks,
  };

  initWorkspace();
})();
