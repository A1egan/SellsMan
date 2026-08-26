from pathlib import Path

path = Path('assets/workspace-v2.css')
css = path.read_text(encoding='utf-8')
marker = '/* workspace v2 readability + board reachability fix */'

if marker in css:
    print('Readability fix already applied')
    raise SystemExit(0)

patch = r'''

/* workspace v2 readability + board reachability fix */

/* Keep the wide customer board dense, but make every stage obviously reachable. */
.workspace-view[data-view="board"] .board,
.workspace-view[data-view="board"] .tag-filter-bar.show + .board {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: scroll;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior-x: contain;
  padding-bottom: 20px;
}
.workspace-view[data-view="board"] .board::-webkit-scrollbar {
  height: 14px;
  width: 10px;
}
.workspace-view[data-view="board"] .board::-webkit-scrollbar-track {
  background: #ded8cc;
  border-top: 1px solid #aaa296;
}
.workspace-view[data-view="board"] .board::-webkit-scrollbar-thumb {
  background: #6e685f;
  border: 3px solid #ded8cc;
  border-radius: 999px;
}
.workspace-view[data-view="board"] .task-bar::after {
  content: "← 横向滚动查看右侧栏目 →";
  margin-left: auto;
  padding-left: 12px;
  color: #5f594f;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

/* Readable desktop type scale for the task/search/analytics workspace. */
.workspace-nav-btn { min-height: 46px; font-size: 13px; }
.workspace-nav-count { font-size: 10px; }
.workspace-side-action { font-size: 11px; }
.workspace-collapse-btn { font-size: 11px; }
.workspace-brand-sub { font-size: 10px; }

.workspace-page-kicker { font-size: 11px; }
.workspace-page-title { font-size: 22px; }
.workspace-page-subtitle { font-size: 13px; }
.workspace-quick-search { height: 40px; font-size: 13px; }

.ws-btn { min-height: 38px; padding: 8px 12px; font-size: 13px; }
.ws-btn.small { min-height: 32px; padding: 5px 9px; font-size: 12px; }
.comic-label { min-height: 22px; font-size: 10px; }
.home-date small { font-size: 12px; }
.home-status-line { font-size: 13px; }

.ws-panel-head { min-height: 56px; padding: 12px 15px; }
.ws-panel-title { font-size: 16px; }
.ws-panel-note { font-size: 12px; }
.rollover-banner { font-size: 13px; }
.rollover-banner strong { font-size: 14px; }

.task-compose input,
.task-compose select,
.ws-input,
.ws-select { height: 40px; font-size: 13px; }

.work-task-row { min-height: 56px; padding: 9px 10px; }
.work-task-title { font-size: 14px; }
.work-task-meta { font-size: 11px; }
.customer-chip { padding: 2px 6px; font-size: 11px; }
.task-icon-btn { width: 31px; height: 31px; font-size: 11px; }
.completed-details summary { font-size: 12px; }

.radar-item { min-height: 64px; padding: 10px 12px; }
.radar-icon { font-size: 10px; }
.radar-label { font-size: 13px; }
.radar-hint { font-size: 11px; }
.radar-value { font-size: 24px; }

.recent-customer { min-height: 46px; padding: 8px 10px; }
.recent-avatar { width: 29px; height: 29px; font-size: 10px; }
.recent-number { font-size: 13px; }
.recent-meta { font-size: 11px; }

.crm-task-row { min-height: 56px; padding: 9px 11px; }
.crm-task-number { font-size: 14px; }
.crm-task-action { font-size: 12px; }
.crm-task-time { font-size: 11px; }

.search-result-card { padding: 13px; }
.search-result-number { font-size: 16px; }
.search-result-stage { font-size: 11px; }
.search-result-note { font-size: 12px; }
.search-tag { padding: 3px 6px; font-size: 10.5px; }

.analytics-kpi-label { font-size: 11px; }
.analytics-bar-row { font-size: 12px; }
.batch-action-card h3 { font-size: 15px; }
.batch-action-card p { font-size: 12px; }
.ws-empty { font-size: 12px; }
.ws-count-note { font-size: 12px; }

.ws-field label { font-size: 12px; }
.rollover-select-row { font-size: 13px; }
.ws-history-note { font-size: 12px; }
.ws-history-date { font-size: 12px; }
.ws-history-date strong { font-size: 13px; }
.ws-history-item { min-height: 40px; font-size: 12px; }
.ws-history-status { font-size: 10.5px; }
'''

path.write_text(css.rstrip() + patch + '\n', encoding='utf-8')
print('Applied workspace readability fix')
