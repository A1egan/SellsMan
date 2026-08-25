from pathlib import Path
import re

path = Path('index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'missing replacement target: {label}')
    if text.count(old) != 1:
        raise SystemExit(f'expected one target for {label}, got {text.count(old)}')
    text = text.replace(old, new, 1)


def regex_once(pattern, repl, label, flags=re.S):
    global text
    new_text, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'expected one regex target for {label}, got {n}')
    text = new_text


# All columns use the same three-card grid.
regex_once(
    r'/\* ====== 待跟进三列小卡 ====== \*/\s*\.column-body\[data-col="pending"\]\s*\{.*?\.column-body\[data-col="pending"\] \.card-number\s*\{.*?\}\s*',
    '',
    'pending-only grid css',
)

# Keep the active tag filter close to the daily-work controls.
replace_once(
    '<!-- 今日跟进任务栏 -->\n<div class="task-bar" id="taskBar"></div>\n\n<!-- 看板 -->',
    '<!-- 今日跟进任务栏 -->\n<div class="task-bar" id="taskBar"></div>\n\n<!-- 当前标签筛选 -->\n<div class="tag-filter-bar" id="tagFilterBar"></div>\n\n<!-- 看板 -->',
    'tag filter insertion',
)
replace_once(
    '\n<!-- 标签筛选栏 -->\n<div class="tag-filter-bar" id="tagFilterBar"></div>\n\n<script>',
    '\n<script>',
    'old tag filter location',
)

# Rebuild learner detail around follow-up first, while keeping all existing field IDs.
new_detail = r'''<!-- 学员详情 -->
<div class="modal-overlay" id="tagModal" onclick="if(event.target===this)closeTagModal()">
  <div class="modal detail-modal">
    <div class="detail-head">
      <div class="detail-head-main">
        <div class="detail-kicker">学员详情</div>
        <div class="detail-identity">
          <strong id="tagModalUser"></strong>
          <span class="detail-badge" id="detailColumnBadge"></span>
          <span class="detail-badge muted" id="detailFollowupBadge"></span>
        </div>
        <div class="detail-tag-summary" id="detailTagSummary"></div>
      </div>
      <button class="detail-close" onclick="closeTagModal()" aria-label="关闭">×</button>
    </div>

    <section class="detail-section detail-section-followup">
      <div class="detail-section-head">
        <div>
          <div class="detail-section-title">本次跟进</div>
          <div class="detail-section-desc">记录沟通结果，并明确下一次动作</div>
        </div>
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
          <input id="detailNextAction" placeholder="例如：问体验效果 / 邀约直播 / 处理价格异议">
        </div>
      </div>
      <button class="btn btn-primary detail-primary-action" onclick="logFollowup()">记录沟通并安排下一步</button>
    </section>

    <section class="detail-section detail-section-history">
      <div class="detail-section-head">
        <div>
          <div class="detail-section-title">最近沟通</div>
          <div class="detail-section-desc">优先看最近 5 次记录，完整历史仍保留</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="copyFollowupSummary()">复制摘要</button>
      </div>
      <div id="followupHistory" class="worklog-box"></div>
    </section>

    <section class="detail-section detail-section-profile">
      <div class="detail-section-head">
        <div>
          <div class="detail-section-title">资料与标签</div>
          <div class="detail-section-desc">低频信息放在这里，不打断日常跟进</div>
        </div>
      </div>

      <div class="profile-grid">
        <div class="profile-main">
          <div class="modal-field">
            <label>跟进备注</label>
            <textarea id="detailNote" rows="3" placeholder="记录学习情况、顾虑、重要上下文..."></textarea>
            <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="saveDetailNote()">保存备注</button>
          </div>
          <div class="modal-field">
            <label>当前标签</label>
            <div id="currentTags" class="current-tags"></div>
          </div>
          <div class="modal-field">
            <label>新建标签</label>
            <div class="new-tag-row">
              <input id="newTagName" placeholder="输入标签名，回车创建" onkeydown="if(event.key==='Enter')createTag()">
              <button class="btn btn-primary btn-sm" onclick="createTag()">添加</button>
            </div>
          </div>
        </div>
        <div class="profile-side">
          <div class="modal-field">
            <label>所有标签（点击切换）</label>
            <div id="allTags" class="all-tags"></div>
          </div>
        </div>
      </div>

      <div class="detail-danger-row">
        <button class="btn btn-outline btn-sm" onclick="detailMoveLow()">移入低意向池</button>
        <button class="btn btn-secondary btn-sm" onclick="detailDelete()">删除学员</button>
      </div>
    </section>
  </div>
</div>

'''
regex_once(r'<!-- 标签管理模态框 -->.*?(?=<!-- 确认弹窗 -->)', new_detail, 'student detail modal')

# Cards only answer: who, priority, and next action.
new_render_card = r'''function renderCard(u) {
  const isSelected = selectedIds.has(u.id);
  const followupStatus = getFollowupStatus(u);
  const tagDots = (u.tags || []).map(tid => {
    const t = getTag(tid);
    if (!t) return '';
    return `<span class="tag-dot-sm" style="background:${t.color}" title="${escapeHtml(t.name)}（点击筛选）" onclick="event.stopPropagation(); filterByTag('${t.id}')"></span>`;
  }).join('');
  const noteTitle = u.note ? ` title="${escapeHtml(u.note)}"` : '';
  return `
    <div class="card status-${followupStatus} ${isSelected ? 'selected' : ''}"
         draggable="true"
         data-id="${u.id}"
         data-followup-status="${followupStatus}"${noteTitle}
         ondragstart="onDragStart(event, '${u.id}')"
         ondragend="onDragEnd(event)"
         onclick="onCardClick(event, '${u.id}')">
      <div class="card-top">
        <span class="card-number">${escapeHtml(u.number)}</span>
        <span class="card-top-right">
          ${tagDots}
          ${batchMode ? `<input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelect('${u.id}')">` : ''}
        </span>
      </div>
      ${renderCardFollowup(u)}
    </div>
  `;
}'''
regex_once(
    r'function renderCard\(u\) \{.*?\n\}\n\n\nfunction startOfToday\(\)',
    new_render_card + '\n\n\nfunction startOfToday()',
    'renderCard',
)

new_followup = r'''function formatFollowupShortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()}`;
}
function renderCardFollowup(u) {
  const st = getFollowupStatus(u);
  const label = st === 'overdue' ? '已逾期'
    : st === 'today' ? '今日跟进'
    : st === 'future' ? `下次 ${formatFollowupShortDate(u.nextFollowUpAt)}`
    : '未安排';
  const action = u.nextAction || '点击查看详情';
  return `<div class="card-followup ${st}">${label}</div><div class="card-action">${escapeHtml(action)}</div>`;
}'''
regex_once(
    r'function renderCardFollowup\(u\) \{.*?\n\}\nfunction setTaskFilter',
    new_followup + '\nfunction setTaskFilter',
    'renderCardFollowup',
)

# Detail summary is display-only; it never writes a new user field.
replace_once(
    "  // 备注与跟进\n  document.getElementById('detailNote').value = user.note || '';",
    "  // 顶部摘要（只读展示，不写入数据）\n  const col = COLUMNS.find(c => c.id === user.column);\n  const status = getFollowupStatus(user);\n  const statusLabel = status === 'overdue' ? '已逾期'\n    : status === 'today' ? '今日跟进'\n    : status === 'future' ? `下次 ${formatFollowupDate(user.nextFollowUpAt)}`\n    : '未安排下次跟进';\n  const columnBadge = document.getElementById('detailColumnBadge');\n  const followupBadge = document.getElementById('detailFollowupBadge');\n  const tagSummary = document.getElementById('detailTagSummary');\n  if (columnBadge) { columnBadge.textContent = col?.name || user.column; columnBadge.style.setProperty('--badge-color', col?.dot || '#64748b'); }\n  if (followupBadge) { followupBadge.textContent = statusLabel; followupBadge.dataset.status = status; }\n  if (tagSummary) {\n    const names = (user.tags || []).map(id => getTag(id)?.name).filter(Boolean);\n    tagSummary.textContent = names.length ? names.join(' · ') : '暂无标签';\n  }\n\n  // 备注与跟进\n  document.getElementById('detailNote').value = user.note || '';",
    'detail summary render',
)
replace_once('box.innerHTML=hs.slice(0,8).map', 'box.innerHTML=hs.slice(0,5).map', 'history visual limit')
replace_once('style="background:${col.dot}2e"', 'style="background:${col.dot}16"', 'column header tint')

# A final override layer keeps the legacy single-file app stable while replacing the visual hierarchy.
workbench_css = r'''

/* ====== 2026 高密度销售工作台 ====== */
:root {
  --bg: #e9ebef;
  --card-bg: #ffffff;
  --text: #172033;
  --text-secondary: #667085;
  --border: #e3e6eb;
  --primary: #2563eb;
  --primary-light: #eff6ff;
  --surface: rgba(255,255,255,.96);
  --panel: #f4f5f7;
  --line: #e5e7eb;
  --ink-muted: #7b8493;
  --shadow: 0 1px 4px rgba(15,23,42,.05);
  --shadow-lg: 0 18px 50px rgba(15,23,42,.16);
  --radius: 9px;
}
body {
  background-color: #e9ebef;
  background-image: linear-gradient(rgba(247,248,250,.91), rgba(247,248,250,.95)), url('manga-bg.jpg');
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  color: var(--text);
}
.header {
  min-height: 54px;
  padding: 8px 16px;
  gap: 12px;
  background: rgba(255,255,255,.95);
  border-bottom-color: var(--line);
  box-shadow: 0 1px 8px rgba(15,23,42,.06);
}
.header h1 { font-size: 18px; letter-spacing: .3px; color: #182033; }
.header-controls { gap: 7px; }
.search-box { width: 240px; padding: 7px 11px; border-radius: 8px; background: #f8fafc; }
.input-box input { width: 142px; padding: 7px 10px; border-radius: 8px; background: #f8fafc; }
.btn { border-radius: 8px; box-shadow: none; }
.btn-primary:hover { transform: none; box-shadow: 0 3px 10px rgba(37,99,235,.22); }
.btn-outline:hover { transform: none; }
.tools-menu { border-radius: 10px; box-shadow: 0 14px 34px rgba(15,23,42,.14); }

/* 栏目总数已经显示在栏目标题中，旧统计条只保留 DOM 兼容性。 */
.stats-bar { display: none; }
.task-bar {
  min-height: 42px;
  top: 54px;
  gap: 7px;
  padding: 6px 16px;
  background: rgba(249,250,251,.97);
  border-bottom-color: var(--line);
  box-shadow: 0 1px 4px rgba(15,23,42,.04);
}
.task-title { color: #7b8493; font-size: 12px; }
.task-pill { padding: 5px 9px; border-radius: 8px; border-color: #e1e5ea; background: #fff; box-shadow: none; color: #596273; }
.task-pill:hover { transform: none; box-shadow: none; border-color: #b9c2cf; }
.task-pill.active { border-color: #93b4f8; background: #eff6ff; color: #1d4ed8; }
.task-pill.overdue.active { border-color: #f5a3a3; background: #fef2f2; color: #b91c1c; }
.task-pill .n { font-size: 13px; }
.effective-kpi { padding-left: 12px; border-left: 1px solid #e3e6eb; color: #697386; }
.effective-kpi b { font-size: 14px; }
.tag-filter-bar { padding: 6px 16px; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--line); }

.board { gap: 10px; padding: 12px 16px 18px; min-height: calc(100vh - 96px); scroll-padding-left: 16px; }
.column {
  flex: 0 0 372px;
  background: #f3f5f7;
  border-radius: 10px;
  border: 1px solid #e0e4e9;
  box-shadow: 0 1px 4px rgba(15,23,42,.05);
}
.column-header { min-height: 42px; padding: 8px 10px; border-bottom: 1px solid #e1e4e8; border-radius: 10px 10px 0 0; }
.column-title { gap: 7px; font-size: 13px; color: #293244; }
.column-badge { font-size: 11px; padding: 2px 6px; border-radius: 7px; color: #4f5968; border-color: rgba(148,163,184,.28); background: rgba(255,255,255,.78); }
.column-dot { width: 8px; height: 8px; box-shadow: none; }
.col-filter-btn { padding: 3px 7px; border-radius: 7px; color: #6b7280; border-color: #d9dee5; }
.column-body { padding: 7px; min-height: 100px; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.column-body .show-more-btn,
.column-body .empty-state { grid-column: 1 / -1; }
.column-body.drag-over { background: #e8f0fe; }

.card {
  min-width: 0;
  min-height: 72px;
  padding: 7px 7px 6px 9px;
  border-radius: 8px;
  border-color: #e1e5ea;
  box-shadow: 0 1px 2px rgba(15,23,42,.035);
  overflow: hidden;
}
.card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; }
.card[data-followup-status="overdue"]::before { background: #ef4444; }
.card[data-followup-status="today"]::before { background: #3b82f6; }
.card[data-followup-status="future"]::before { background: #cbd5e1; }
.card:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(15,23,42,.08); border-color: #cfd5dd; }
.card-top { margin-bottom: 5px; min-width: 0; }
.card-number { min-width: 0; font-size: 13px; line-height: 1.15; color: #1e293b; overflow: hidden; text-overflow: ellipsis; }
.card-top-right { min-width: 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px; flex-wrap: wrap; }
.tag-dot-sm { width: 7px; height: 7px; box-shadow: 0 0 0 1px rgba(0,0,0,.10); }
.card-checkbox { width: 15px; height: 15px; }
.card-followup { margin-top: 0; font-size: 10px; font-weight: 800; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-followup.today { color: #1d4ed8; }
.card-followup.overdue { color: #b91c1c; }
.card-followup.future { color: #64748b; }
.card-followup.unscheduled { color: #9aa2af; }
.card-action { margin-top: 4px; min-width: 0; color: #576071; font-size: 11px; font-weight: 600; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.show-more-btn { margin-top: 2px; border-color: #cfd5dd; background: rgba(255,255,255,.7); }
.empty-state { color: #9aa3b1; padding: 22px 10px; }

.compact .column { flex: 0 0 348px; }
.compact .column-header { padding: 7px 9px; }
.compact .column-body { padding: 5px; gap: 4px; }
.compact .card { min-height: 62px; padding: 6px 6px 5px 8px; margin-bottom: 0; }
.compact .card-number { font-size: 12px; }
.compact .card-action { font-size: 10px; margin-top: 3px; }
.compact .card-followup { font-size: 9.5px; }

.modal-overlay { background: rgba(15,23,42,.42); backdrop-filter: blur(2px); }
.detail-modal {
  width: 660px;
  max-width: min(94vw, 660px);
  max-height: 88vh;
  padding: 0;
  overflow-y: auto;
  border-radius: 12px;
  border: 1px solid #dfe3e8;
  box-shadow: 0 20px 56px rgba(15,23,42,.20);
}
.detail-head { position: sticky; top: 0; z-index: 4; display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 13px 17px 12px; background: rgba(255,255,255,.98); border-bottom: 1px solid #e5e7eb; }
.detail-head-main { min-width: 0; }
.detail-kicker { margin-bottom: 3px; font-size: 10px; font-weight: 700; color: #98a1af; letter-spacing: .08em; }
.detail-identity { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.detail-identity strong { font-size: 20px; color: #172033; letter-spacing: .2px; }
.detail-badge { --badge-color: #64748b; display: inline-flex; align-items: center; min-height: 22px; padding: 2px 7px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--badge-color) 28%, white); background: color-mix(in srgb, var(--badge-color) 9%, white); color: color-mix(in srgb, var(--badge-color) 80%, #111827); font-size: 10.5px; font-weight: 800; }
.detail-badge.muted { --badge-color: #64748b; }
.detail-badge[data-status="overdue"] { --badge-color: #dc2626; }
.detail-badge[data-status="today"] { --badge-color: #2563eb; }
.detail-tag-summary { margin-top: 4px; max-width: 500px; color: #7b8493; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.detail-close { flex: 0 0 auto; width: 30px; height: 30px; border: 0; border-radius: 8px; background: #f4f5f7; color: #7b8493; font-size: 22px; line-height: 1; cursor: pointer; }
.detail-close:hover { background: #e9edf2; color: #334155; }
.detail-section { padding: 13px 17px 14px; border-bottom: 1px solid #edf0f3; }
.detail-section:last-child { border-bottom: 0; }
.detail-section-followup { background: #fff; }
.detail-section-history { background: #f9fafb; }
.detail-section-profile { background: #fff; }
.detail-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.detail-section-title { color: #273244; font-size: 13px; font-weight: 900; }
.detail-section-desc { margin-top: 2px; color: #98a1af; font-size: 10.5px; }
.detail-section label { display: block; margin-bottom: 4px; color: #667085; font-size: 11px; font-weight: 700; }
.detail-section input,
.detail-section textarea,
.detail-section select { width: 100%; padding: 7px 9px; border: 1px solid #d9dee5; border-radius: 8px; background: #fbfcfd; color: #273244; font: inherit; font-size: 12px; outline: none; }
.detail-section input:focus,
.detail-section textarea:focus,
.detail-section select:focus { border-color: #8ab0fa; box-shadow: 0 0 0 3px rgba(37,99,235,.09); background: #fff; }
.followup-grid { grid-template-columns: 1fr 1.15fr; gap: 9px 10px; }
.quick-row { margin-top: 5px; gap: 4px; }
.quick-btn { padding: 4px 7px; border-radius: 6px; font-size: 10.5px; }
.detail-primary-action { width: 100%; margin-top: 9px; padding: 8px 12px; }
.worklog-box { max-height: 158px; border-radius: 8px; background: #fff; }
.worklog-item { padding: 7px 9px; font-size: 11px; }
.profile-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(210px, .82fr); gap: 12px; }
.profile-grid .modal-field { margin-bottom: 11px; }
.profile-grid textarea { min-height: 68px; resize: vertical; }
.current-tags { gap: 5px; min-height: 24px; }
.all-tags { max-height: 166px; gap: 4px; }
.tag-row { padding: 5px 7px; border-radius: 7px; }
.detail-danger-row { display: flex; justify-content: flex-end; gap: 6px; padding-top: 2px; }

::-webkit-scrollbar { width: 7px; height: 8px; }
::-webkit-scrollbar-track { background: rgba(148,163,184,.12); }
::-webkit-scrollbar-thumb { background: #c8ced7; border: 2px solid transparent; background-clip: padding-box; border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #aeb6c2; border: 2px solid transparent; background-clip: padding-box; }

@media (max-width: 900px) {
  .header { min-height: auto; flex-wrap: wrap; padding: 8px 10px; }
  .header h1 { font-size: 17px; }
  .header-controls { width: 100%; justify-content: flex-start; }
  .search-box { width: min(42vw, 220px); }
  .input-box input { width: min(28vw, 140px); }
  .task-bar { top: 92px; padding: 6px 10px; }
  .effective-kpi { display: none; }
  .board { padding: 9px 10px 15px; }
  .column { flex: 0 0 348px; }
  .followup-grid, .profile-grid { grid-template-columns: 1fr; }
  .detail-modal { max-width: 94vw; }
}
'''
replace_once('</style>', workbench_css + '\n</style>', 'workbench css insertion')

path.write_text(text, encoding='utf-8')
print('workbench UI applied')
