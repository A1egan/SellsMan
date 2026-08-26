from pathlib import Path

path = Path('assets/workspace-v2.css')
text = path.read_text(encoding='utf-8')
marker = '/* board v3 · five-column desktop fit */'
if marker in text:
    raise SystemExit(0)

block = r'''

/* board v3 · five-column desktop fit */
@media (min-width: 1280px) {
  body.workspace-v2-ready .workspace-view[data-view="board"] .board,
  body.workspace-v2-ready .workspace-view[data-view="board"] .tag-filter-bar.show + .board {
    gap: 6px;
    padding: 8px 8px 14px;
    overflow-x: hidden;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .board > .column {
    flex: 1 1 0 !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: none !important;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .column-header {
    padding: 8px 8px;
    gap: 5px;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .column-title {
    gap: 5px;
    min-width: 0;
    font-size: 13px;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .column-badge {
    padding-inline: 6px;
    font-size: 11px;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .col-filter-btn {
    padding: 3px 6px;
    font-size: 10px;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .column-body,
  body.workspace-v2-ready .workspace-view[data-view="board"] .column-body[data-col="pending"] {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 4px;
    padding: 5px;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .card {
    min-width: 0;
    padding: 5px 6px;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .card-note {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
}

@media (min-width: 1800px) {
  body.workspace-v2-ready .workspace-view[data-view="board"] .board,
  body.workspace-v2-ready .workspace-view[data-view="board"] .tag-filter-bar.show + .board {
    gap: 8px;
    padding-inline: 10px;
  }

  body.workspace-v2-ready .workspace-view[data-view="board"] .column-body,
  body.workspace-v2-ready .workspace-view[data-view="board"] .column-body[data-col="pending"] {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 5px;
    padding: 6px;
  }
}
'''

path.write_text(text.rstrip() + block + '\n', encoding='utf-8')
