from pathlib import Path

path = Path('assets/workspace-v2.css')
text = path.read_text(encoding='utf-8')
marker = '.workspace-view[data-view="board"] .header {'
old = '''.workspace-view[data-view="board"] .header {
  position: static;
  height: 48px;
  min-height: 48px;
  padding: 6px 12px;
  background: #fffdf7;
'''
new = '''.workspace-view[data-view="board"] .header {
  position: static;
  height: 48px;
  min-height: 48px;
  padding: 6px 12px;
  background: #fffdf7;
  backdrop-filter: none;
'''

if 'backdrop-filter: none;' in text[text.find(marker):text.find(marker) + 320]:
    print('Tools menu layering fix already applied')
    raise SystemExit(0)
if old not in text:
    raise SystemExit('board header block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Disabled obsolete board-header backdrop filter')
