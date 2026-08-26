from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


app_path = Path('assets/workspace-v2.js')
app = app_path.read_text(encoding='utf-8')
original_app = app

app = app.replace('>+ 今日任务</button>', '>+ 工作计划</button>')
app = app.replace('    const futurePlanned = parts.planned;\n', "    const tomorrowPlanned = parts.planned.filter(t => t.plannedDate === tomorrowKey());\n")
app = app.replace("${renderWorkTaskRows(futurePlanned.slice(0,8), 'planned')}", "${renderWorkTaskRows(tomorrowPlanned.slice(0,8), 'planned')}")

app = replace_once(
    app,
    '<div class="ws-panel-actions"><button class="ws-btn small" type="button" onclick="WorkspaceV2.openTaskEditor(\'active\')">+ 详细任务</button></div>',
    '<div class="ws-panel-actions"><button class="ws-btn small ghost" type="button" onclick="WorkspaceV2.openTaskHistory()">任务历史</button><button class="ws-btn small" type="button" onclick="WorkspaceV2.openTaskEditor(\'active\')">+ 详细任务</button></div>',
    'home task header actions',
)

rollover_tail = '''          <div class="ws-modal-actions"><button class="ws-btn ghost" type="button" onclick="WorkspaceV2.closeRolloverSelector()">取消</button><button class="ws-btn primary" type="button" onclick="WorkspaceV2.confirmSelectedRollover()">转入选中</button></div>
        </div>
      </div>`;'''
history_tail = '''          <div class="ws-modal-actions"><button class="ws-btn ghost" type="button" onclick="WorkspaceV2.closeRolloverSelector()">取消</button><button class="ws-btn primary" type="button" onclick="WorkspaceV2.confirmSelectedRollover()">转入选中</button></div>
        </div>
      </div>
      <div class="ws-modal-overlay" id="wsTaskHistoryModal" onclick="if(event.target===this) WorkspaceV2.closeTaskHistory()">
        <div class="ws-modal ws-history-modal">
          <div class="comic-label">WORK LOG</div>
          <h2>任务历史</h2>
          <div class="ws-history-note">按计划日期保留今日/明日工作记录，已完成和暂缓内容都不会消失。</div>
          <div class="ws-task-history-list" id="wsTaskHistoryList"></div>
          <div class="ws-modal-actions"><button class="ws-btn primary" type="button" onclick="WorkspaceV2.closeTaskHistory()">关闭</button></div>
        </div>
      </div>`;'''
app = replace_once(app, rollover_tail, history_tail, 'task history modal')

history_functions = r'''
  function openTaskHistory() {
    const modal = document.getElementById('wsTaskHistoryModal');
    const box = document.getElementById('wsTaskHistoryList');
    const list = state.workTasks.slice().map(core.normalizeTask).sort((a, b) => {
      const dateOrder = String(b.plannedDate || '').localeCompare(String(a.plannedDate || ''));
      return dateOrder || Number(b.createdAt || 0) - Number(a.createdAt || 0);
    }).slice(0, 160);
    if (!list.length) {
      box.innerHTML = '<div class="ws-empty">还没有任务历史</div>';
    } else {
      const groups = new Map();
      list.forEach(task => {
        const key = task.plannedDate || '未标日期';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(task);
      });
      box.innerHTML = Array.from(groups.entries()).map(([date, tasks]) => `
        <section class="ws-history-day">
          <div class="ws-history-date"><strong>${safe(date)}</strong><span>${tasks.length} 项</span></div>
          <div class="ws-history-items">${tasks.map(task => {
            const user = task.linkedCustomerId ? getUser(task.linkedCustomerId) : null;
            const labels = { active: '进行中', planned: '计划中', deferred: '已暂缓', completed: '已完成' };
            return `<div class="ws-history-item" data-status="${safe(task.status)}"><span class="ws-history-status">${labels[task.status] || safe(task.status)}</span><span class="ws-history-title">${safe(task.title || '未命名任务')}</span>${user ? `<button class="customer-chip" type="button" onclick="WorkspaceV2.openCustomer('${safe(user.id)}')">#${safe(user.number)}</button>` : ''}</div>`;
          }).join('')}</div>
        </section>`).join('');
    }
    modal.classList.add('show');
  }

  function closeTaskHistory() {
    document.getElementById('wsTaskHistoryModal').classList.remove('show');
  }
'''
app = replace_once(app, '\n  function wireChrome() {', history_functions + '\n  function wireChrome() {', 'task history functions')

app = replace_once(
    app,
    '    confirmSelectedRollover,\n    openCustomer,',
    '    confirmSelectedRollover,\n    openTaskHistory,\n    closeTaskHistory,\n    openCustomer,',
    'task history exports',
)

if app != original_app:
    app_path.write_text(app, encoding='utf-8')
    print('workspace app refined')
else:
    print('workspace app already refined')

css_path = Path('assets/workspace-v2.css')
css = css_path.read_text(encoding='utf-8')
if '/* workspace v2 task history */' not in css:
    css += r'''

/* workspace v2 task history */
.ws-history-modal { width: min(640px, 94vw); }
.ws-history-note { margin: -5px 0 12px; color: var(--ws-muted); font-size: 9px; line-height: 1.5; }
.ws-task-history-list { display: grid; gap: 10px; max-height: 58vh; overflow-y: auto; padding-right: 3px; }
.ws-history-day { border: 1px solid #d4ccbe; border-radius: 6px; overflow: hidden; background: #fff; }
.ws-history-date { display: flex; align-items: center; justify-content: space-between; padding: 7px 9px; border-bottom: 1px solid #ddd5c8; background: #f4efe5; font-size: 9px; }
.ws-history-date strong { font-size: 10px; }
.ws-history-items { display: grid; }
.ws-history-item { display: grid; grid-template-columns: 50px minmax(0,1fr) auto; gap: 7px; align-items: center; min-height: 34px; padding: 6px 8px; border-bottom: 1px dashed #e3ddd2; font-size: 9px; }
.ws-history-item:last-child { border-bottom: 0; }
.ws-history-status { text-align: center; padding: 2px 4px; border: 1px solid #bbb3a7; border-radius: 3px; color: var(--ws-muted); font-size: 7.5px; font-weight: 900; }
.ws-history-item[data-status="completed"] .ws-history-status { color: #216b4b; border-color: #72af92; background: #e5f5ec; }
.ws-history-item[data-status="deferred"] .ws-history-status { color: #87611d; border-color: #d8b36b; background: #fff5dc; }
.ws-history-item[data-status="active"] .ws-history-status { color: #3d319e; border-color: #9188df; background: #efedff; }
.ws-history-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 760; }
'''
    css_path.write_text(css, encoding='utf-8')
    print('workspace history styles added')
else:
    print('workspace history styles already present')
