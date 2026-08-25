from pathlib import Path
import re

path = Path('index.html')
html = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global html
    if old not in html:
        raise SystemExit(f'anchor missing: {label}')
    html = html.replace(old, new, 1)


def regex_once(pattern: str, replacement: str, label: str) -> None:
    global html
    html, count = re.subn(pattern, replacement, html, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'pattern replacement failed: {label} ({count})')


# 1) 顶部从三层压成两层：去掉独立统计栏，任务栏保留。
replace_once(
    '<!-- 统计栏 -->\n<div class="stats-bar" id="statsBar"></div>\n\n',
    '',
    'stats bar html',
)
replace_once(
    '  renderStats();\n  renderTaskBar();',
    '  renderTaskBar();',
    'render stats call',
)

# 2) 标签筛选提示移动到看板上方，避免筛选状态跑到页面底部。
replace_once(
    '<!-- 看板 -->\n<div class="board" id="board"></div>',
    '<!-- 标签筛选栏 -->\n<div class="tag-filter-bar" id="tagFilterBar"></div>\n\n<!-- 看板 -->\n<div class="board" id="board"></div>',
    'board anchor',
)
replace_once(
    '\n<!-- 标签筛选栏 -->\n<div class="tag-filter-bar" id="tagFilterBar"></div>\n\n<script>',
    '\n<script>',
    'old tag filter placement',
)

# 3) 重排学员详情：高频跟进在左，资料与标签在右；保留所有既有 DOM id。
new_detail_modal = r'''<!-- 标签管理模态框 -->
<div class="modal-overlay" id="tagModal" onclick="if(event.target===this)closeTagModal()">
  <div class="modal detail-modal">
    <div class="detail-modal-head">
      <div>
        <div class="detail-eyebrow">学员详情</div>
        <div class="detail-title-row">
          <h2 id="tagModalUser"></h2>
          <span class="detail-column-badge" id="detailColumnBadge"></span>
        </div>
        <div class="detail-tag-summary" id="detailTagSummary">暂无标签</div>
      </div>
      <button class="detail-close" type="button" title="关闭" onclick="closeTagModal()">×</button>
    </div>

    <div class="detail-modal-body">
      <div class="detail-primary">
        <section class="detail-section followup-section">
          <div class="detail-section-head">
            <div>
              <span class="detail-kicker">NEXT ACTION</span>
              <h3>本次沟通与下一步</h3>
            </div>
            <span class="mini-help">记录后自动进入后续任务队列</span>
          </div>

          <div class="followup-grid">
            <div>
              <label>沟通结果</label>
              <select id="detailResult">
                <option value="">未选择</option>
                <option value="未回复">未回复</option>
                <option value="已了解情况">已了解情况</option>
                <option value="已发现需求">已发现需求</option>
                <option value="有意向">有意向</option>
                <option value="明确不考虑">明确不考虑</option>
                <option value="已成交">已成交</option>
              </select>
            </div>
            <div>
              <label>下次跟进时间</label>
              <input id="detailNextTime" type="datetime-local">
              <div class="quick-row">
                <button class="quick-btn" onclick="setQuickFollowup(1)">明天</button>
                <button class="quick-btn" onclick="setQuickFollowup(3)">3天后</button>
                <button class="quick-btn" onclick="setQuickFollowup(7)">7天后</button>
                <button class="quick-btn" onclick="clearFollowupTime()">清空</button>
              </div>
            </div>
            <div class="full">
              <label>下一步动作</label>
              <input id="detailNextAction" placeholder="例如：问体验效果 / 邀约直播 / PV重新激活 / 处理价格异议">
            </div>
          </div>
          <button class="btn btn-primary detail-log-btn" onclick="logFollowup()">记录本次沟通并安排下一步</button>
        </section>

        <section class="detail-section history-section">
          <div class="detail-section-head compact-head">
            <div>
              <span class="detail-kicker">HISTORY</span>
              <h3>最近沟通</h3>
            </div>
            <button class="btn btn-outline btn-sm" onclick="copyFollowupSummary()">复制跟进摘要</button>
          </div>
          <div id="followupHistory" class="worklog-box"></div>
        </section>
      </div>

      <aside class="detail-secondary">
        <section class="detail-section info-section">
          <div class="detail-section-head compact-head">
            <div>
              <span class="detail-kicker">PROFILE</span>
              <h3>跟进资料</h3>
            </div>
          </div>
          <div class="modal-field detail-note-field">
            <label>备注</label>
            <textarea id="detailNote" rows="4" placeholder="记录当前学习情况、需求、异议等..."></textarea>
            <button class="btn btn-outline btn-sm" onclick="saveDetailNote()">保存备注</button>
          </div>

          <div class="modal-field">
            <label>当前标签</label>
            <div id="currentTags" class="current-tags"></div>
          </div>

          <details class="detail-disclosure">
            <summary>管理全部标签</summary>
            <div class="detail-disclosure-body">
              <div id="allTags" class="all-tags"></div>
              <div class="new-tag-row">
                <input id="newTagName" placeholder="输入标签名，回车创建" onkeydown="if(event.key==='Enter')createTag()">
                <button class="btn btn-primary btn-sm" onclick="createTag()">添加</button>
              </div>
            </div>
          </details>

          <div class="detail-danger-zone">
            <button class="btn btn-outline btn-sm" onclick="detailMoveLow()">移入低意向池</button>
            <button class="btn btn-secondary btn-sm" onclick="detailDelete()">删除用户</button>
          </div>
        </section>
      </aside>
    </div>
  </div>
</div>

<!-- 确认弹窗 -->'''
regex_once(
    r'<!-- 标签管理模态框 -->.*?<!-- 确认弹窗 -->',
    new_detail_modal,
    'detail modal',
)

# 4) 卡片只承担：识别人 + 优先级 + 下一步动作。
new_render_card = r'''function renderCard(u) {
  const isSelected = selectedIds.has(u.id);
  const followupStatus = getFollowupStatus(u);
  const visibleTags = (u.tags || []).slice(0, 3);
  const tagDots = visibleTags.map(tid => {
    const t = getTag(tid);
    if (!t) return '';
    return `<span class="tag-dot-sm" style="background:${t.color}" title="${escapeHtml(t.name)}（点击筛选）" onclick="event.stopPropagation(); filterByTag('${t.id}')"></span>`;
  }).join('');
  const extraTags = (u.tags || []).length > 3 ? `<span class="tag-more">+${(u.tags || []).length - 3}</span>` : '';
  const hoverText = u.note ? `备注：${escapeHtml(u.note)}` : `学员 ${escapeHtml(u.number)}`;
  return `
    <div class="card ${isSelected ? 'selected' : ''} status-${followupStatus}"
         draggable="true"
         data-id="${u.id}"
         data-followup-status="${followupStatus}"
         title="${hoverText}"
         ondragstart="onDragStart(event, '${u.id}')"
         ondragend="onDragEnd(event)"
         onclick="onCardClick(event, '${u.id}')">
      <div class="card-top">
        <span class="card-number">${escapeHtml(u.number)}</span>
        <div class="card-signals">
          ${tagDots}${extraTags}
          ${batchMode ? `<input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelect('${u.id}')">` : ''}
        </div>
      </div>
      ${renderCardFollowup(u)}
      <div class="card-action ${u.nextAction ? '' : 'muted'}">${escapeHtml(u.nextAction || '未安排下一步')}</div>
    </div>
  `;
}


function startOfToday()'''
regex_once(
    r'function renderCard\(u\) \{.*?\n\}\n\n\nfunction startOfToday\(\)',
    new_render_card,
    'renderCard',
)

new_followup = r'''function renderCardFollowup(u) {
  const st = getFollowupStatus(u);
  if (st === 'unscheduled') {
    return '<div class="card-followup unscheduled">未安排时间</div>';
  }
  const time = formatFollowupDate(u.nextFollowUpAt);
  const prefix = st === 'overdue' ? '已逾期' : (st === 'today' ? '今日跟进' : '下次');
  return `<div class="card-followup ${st}">${prefix}<span>${time}</span></div>`;
}
function setTaskFilter'''
regex_once(
    r'function renderCardFollowup\(u\) \{.*?\n\}\nfunction setTaskFilter',
    new_followup,
    'renderCardFollowup',
)

# 5) 详情摘要只读展示，不改变数据。
needle = """function renderTagModal() {
  const user = users.find(u => u.id === modalUserId);
  if (!user) return;

  // 备注与跟进
"""
replacement = """function renderTagModal() {
  const user = users.find(u => u.id === modalUserId);
  if (!user) return;

  const detailColumnBadge = document.getElementById('detailColumnBadge');
  const detailTagSummary = document.getElementById('detailTagSummary');
  const col = COLUMNS.find(c => c.id === user.column);
  if (detailColumnBadge) detailColumnBadge.textContent = col ? col.name : user.column;
  if (detailTagSummary) {
    const names = (user.tags || []).map(id => getTag(id)?.name).filter(Boolean);
    detailTagSummary.textContent = names.length ? names.join(' · ') : '暂无标签';
  }

  // 备注与跟进
"""
replace_once(needle, replacement, 'detail summary render')
html = html.replace('hs.slice(0,8).map', 'hs.slice(0,5).map', 1)

# 6) 新视觉层。追加覆盖，避免动数据和大量旧样式。
workbench_css = r'''
/* ====== 高密度销售工作台 · 2026-08 ====== */
:root {
  --workspace-bg: #eef1f5;
  --workspace-surface: #ffffff;
  --workspace-soft: #f5f7fa;
  --workspace-border: #dfe4ea;
  --workspace-text: #18212f;
  --workspace-muted: #748094;
  --workspace-blue: #2563eb;
  --workspace-red: #dc2626;
  --workspace-orange: #ea580c;
  --workspace-green: #059669;
}

body {
  color: var(--workspace-text);
  background-color: var(--workspace-bg);
  background-image: linear-gradient(rgba(246,248,251,.93), rgba(241,244,248,.96)), url('manga-bg.jpg');
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

.header {
  min-height: 54px;
  height: 54px;
  padding: 7px 16px;
  gap: 12px;
  background: rgba(255,255,255,.96);
  border-bottom: 1px solid var(--workspace-border);
  box-shadow: 0 1px 8px rgba(15,23,42,.06);
}
.header h1 {
  font-size: 18px;
  letter-spacing: .4px;
  color: #172033;
}
.header-controls { gap: 7px; flex-wrap: nowrap; }
.search-box {
  width: min(310px, 26vw);
  height: 36px;
  border-radius: 9px;
  background: #f8fafc;
}
.input-box input {
  width: 150px;
  height: 36px;
  border-radius: 9px;
  background: #f8fafc;
}
.header .btn { min-height: 34px; border-radius: 9px; }
.tools-menu { border-radius: 10px; box-shadow: 0 14px 35px rgba(15,23,42,.14); }

.task-bar {
  top: 54px;
  min-height: 42px;
  padding: 5px 16px;
  gap: 6px;
  background: rgba(248,250,252,.97);
  border-bottom: 1px solid var(--workspace-border);
  box-shadow: none;
}
.task-title { display: none; }
.task-pill {
  min-height: 30px;
  padding: 4px 10px;
  border-radius: 8px;
  border-color: #dbe1e8;
  background: #fff;
  box-shadow: none;
  font-size: 11px;
  color: #526075;
}
.task-pill .n { font-size: 13px; }
.task-pill:hover { transform: none; border-color: #b9c3d0; box-shadow: none; }
.task-pill.active { background: #eaf2ff; border-color: #93b4f8; color: #174ea6; }
.task-pill.overdue.active { background: #fff0f0; border-color: #f3a5a5; color: #b91c1c; }
.effective-kpi { color: #6b7688; }
.effective-kpi b { font-size: 14px; }

.tag-filter-bar {
  position: sticky;
  top: 96px;
  z-index: 80;
  padding: 6px 16px;
  background: rgba(255,255,255,.97);
  border-bottom: 1px solid var(--workspace-border);
}

.board {
  gap: 10px;
  padding: 12px 16px 18px;
  min-height: calc(100vh - 96px);
  scroll-padding-left: 16px;
}
.column {
  flex: 0 0 372px;
  background: var(--workspace-soft);
  border: 1px solid var(--workspace-border);
  border-radius: 11px;
  box-shadow: 0 1px 3px rgba(15,23,42,.05);
  overflow: visible;
}
.column-header {
  min-height: 42px;
  padding: 8px 10px;
  background: #f9fafb !important;
  border-radius: 11px 11px 0 0;
  border-top: 3px solid #94a3b8;
  border-bottom-color: var(--workspace-border);
}
.column[data-col="pending"] .column-header { border-top-color: #3b82f6; }
.column[data-col="contacting"] .column-header { border-top-color: #f97316; }
.column[data-col="replied"] .column-header { border-top-color: #10b981; }
.column[data-col="lowinterest"] .column-header { border-top-color: #94a3b8; }
.column[data-col="silent"] .column-header { border-top-color: #475569; }
.column-title { gap: 6px; font-size: 13px; color: #263244; }
.column-dot { width: 7px; height: 7px; box-shadow: none; }
.column-badge {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  color: #5d6878;
  border-color: #dce2e8;
  background: #fff;
}
.col-filter-btn {
  padding: 3px 7px;
  font-size: 10px;
  color: #667085;
  border-color: #d7dde5;
  border-radius: 7px;
}

.column-body {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
  gap: 7px;
  padding: 8px;
  min-height: 98px;
  background: #f4f6f8;
  border-radius: 0 0 11px 11px;
}
.column-body[data-col="pending"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.column-body .show-more-btn,
.column-body .empty-state { grid-column: 1 / -1; }

.card {
  min-width: 0;
  min-height: 76px;
  padding: 8px 8px 7px 10px;
  border-radius: 8px;
  border: 1px solid #dde3ea;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15,23,42,.04);
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #d7dde5;
}
.card.status-overdue::before { background: var(--workspace-red); }
.card.status-today::before { background: var(--workspace-blue); }
.card.status-future::before { background: #aab4c2; }
.card.status-unscheduled::before { background: #d9dee6; }
.card:hover {
  transform: translateY(-1px);
  border-color: #c7d0db;
  box-shadow: 0 5px 13px rgba(15,23,42,.08);
}
.card-top { margin-bottom: 6px; gap: 4px; }
.card-number {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 1.1;
  color: #1f2a3a;
}
.card-signals {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  min-width: 0;
}
.card-signals .tag-dot-sm { width: 7px; height: 7px; }
.tag-more { font-size: 9px; color: #8a94a3; font-weight: 700; }
.card-checkbox { width: 14px; height: 14px; margin-left: 2px; }
.card-followup {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-top: 0;
  font-size: 10px;
  line-height: 1.2;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
}
.card-followup span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #8993a2;
  font-weight: 600;
}
.card-followup.overdue { color: #c62828; }
.card-followup.today { color: #2458b3; }
.card-followup.future { color: #657186; }
.card-followup.unscheduled { color: #9aa3af; font-weight: 650; }
.card-action {
  margin-top: 5px;
  font-size: 10.5px;
  line-height: 1.25;
  color: #465268;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-action.muted { color: #a0a8b4; font-weight: 550; }
.card-meta, .card-tags, .card-tagicon, .card-time, .card-reply-badge { display: none !important; }

.compact .column { flex-basis: 346px; }
.compact .column-body { gap: 5px; padding: 6px; }
.compact .card { min-height: 67px; padding: 6px 6px 6px 8px; }
.compact .card-number { font-size: 12px; }
.compact .card-followup, .compact .card-action { font-size: 9.5px; }

.empty-state { padding: 24px 8px; color: #a0a8b4; }
.show-more-btn {
  border-radius: 7px;
  border-color: #ccd4de;
  color: #667085;
  background: rgba(255,255,255,.8);
}

/* 学员详情：第一屏优先完成“结果 → 时间 → 下一步” */
#tagModal { padding: 18px; }
#tagModal .detail-modal {
  width: 860px;
  max-width: 94vw;
  max-height: 90vh;
  padding: 0;
  overflow: hidden;
  border-radius: 14px;
  border-color: #dce2e8;
}
.detail-modal-head {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: #fff;
  border-bottom: 1px solid #e4e8ee;
}
.detail-eyebrow, .detail-kicker {
  font-size: 9px;
  line-height: 1;
  letter-spacing: 1.1px;
  font-weight: 900;
  color: #9aa3b0;
}
.detail-title-row { display: flex; align-items: center; gap: 9px; margin-top: 5px; }
#tagModal .detail-title-row h2 {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 21px;
  color: #172033;
}
.detail-column-badge {
  padding: 3px 8px;
  border-radius: 999px;
  background: #eef3fb;
  color: #47617f;
  font-size: 10px;
  font-weight: 800;
}
.detail-tag-summary {
  margin-top: 4px;
  max-width: 620px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #7c8797;
}
.detail-close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: #f3f5f7;
  color: #697586;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.detail-close:hover { background: #e8ebef; color: #1f2937; }
.detail-modal-body {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(250px, .82fr);
  gap: 12px;
  padding: 12px;
  max-height: calc(90vh - 76px);
  overflow: auto;
  background: #f3f5f8;
}
.detail-primary, .detail-secondary { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.detail-section {
  background: #fff;
  border: 1px solid #dfe4ea;
  border-radius: 11px;
  padding: 13px;
  box-shadow: 0 1px 2px rgba(15,23,42,.03);
}
.detail-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 11px;
}
.detail-section-head h3 { margin-top: 4px; font-size: 14px; color: #263244; }
.compact-head { align-items: center; }
.followup-grid { gap: 9px; }
.followup-grid label,
.info-section .modal-field > label {
  display: block;
  margin-bottom: 4px;
  color: #697586;
  font-size: 11px;
  font-weight: 700;
}
.followup-grid input,
.followup-grid select,
.info-section textarea,
.info-section input {
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid #d6dde6;
  border-radius: 8px;
  background: #fbfcfd;
  font: inherit;
  font-size: 12px;
  outline: none;
}
.followup-grid input:focus,
.followup-grid select:focus,
.info-section textarea:focus,
.info-section input:focus {
  border-color: #8db0f6;
  box-shadow: 0 0 0 3px rgba(37,99,235,.09);
  background: #fff;
}
.quick-row { gap: 4px; margin-top: 5px; }
.quick-btn { padding: 4px 7px; border-radius: 6px; font-size: 10px; }
.detail-log-btn { width: 100%; margin-top: 9px; min-height: 37px; border-radius: 8px; }
.worklog-box {
  max-height: 165px;
  border-radius: 8px;
  border-color: #e0e5eb;
  background: #f8fafc;
}
.worklog-item { padding: 7px 9px; font-size: 11px; }
.detail-note-field { margin-bottom: 12px; }
.detail-note-field textarea { min-height: 86px; resize: vertical; }
.detail-note-field .btn { margin-top: 6px; }
.current-tags { min-height: 22px; gap: 4px; }
.tag-chip.lg { font-size: 10px; padding: 3px 7px; }
.detail-disclosure {
  margin-top: 8px;
  border-top: 1px solid #e6e9ee;
  padding-top: 9px;
}
.detail-disclosure summary {
  cursor: pointer;
  color: #526075;
  font-size: 11px;
  font-weight: 800;
  user-select: none;
}
.detail-disclosure-body { margin-top: 8px; }
.all-tags { max-height: 160px; gap: 4px; }
.tag-row { padding: 5px 7px; border-radius: 7px; }
.new-tag-row { margin-top: 7px; }
.detail-danger-zone {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #eceff3;
}

::-webkit-scrollbar { width: 7px; height: 7px; }
::-webkit-scrollbar-track { background: #edf0f3; }
::-webkit-scrollbar-thumb { background: #bdc5d0; border: 1px solid #edf0f3; border-radius: 8px; }
::-webkit-scrollbar-thumb:hover { background: #9da8b6; }

@media (max-width: 900px) {
  .header { height: auto; min-height: 54px; flex-wrap: wrap; }
  .header-controls { flex-wrap: wrap; justify-content: flex-start; }
  .search-box { width: 220px; }
  .task-bar { top: 88px; }
  .tag-filter-bar { top: 130px; }
  .effective-kpi { display: none; }
  .column { flex-basis: 338px; }
  .detail-modal-body { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  .header h1 { width: 100%; }
  .search-box { width: min(100%, 230px); }
  .input-box input { width: 126px; }
  .board { padding: 8px; }
  .column { flex-basis: 324px; }
  .column-body { gap: 5px; padding: 6px; }
  .card { min-height: 68px; padding: 6px 5px 6px 8px; }
  .card-number { font-size: 12px; }
  .card-followup, .card-action { font-size: 9px; }
  #tagModal { padding: 6px; }
  #tagModal .detail-modal { max-width: 98vw; max-height: 96vh; }
  .detail-modal-body { max-height: calc(96vh - 72px); padding: 7px; gap: 7px; }
  .followup-grid { grid-template-columns: 1fr; }
  .followup-grid .full { grid-column: auto; }
}
'''
if '/* ====== 高密度销售工作台 · 2026-08 ====== */' not in html:
    replace_once('</style>', workbench_css + '\n</style>', 'style end')

path.write_text(html, encoding='utf-8')
print('CRM workbench UI applied')
