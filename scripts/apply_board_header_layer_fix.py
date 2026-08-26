from pathlib import Path

path = Path('assets/workspace-v2.css')
text = path.read_text(encoding='utf-8')
old = '''.workspace-view[data-view="board"] .header {
  position: static;
  height: 48px;'''
new = '''.workspace-view[data-view="board"] .header {
  position: relative;
  z-index: 400;
  height: 48px;'''

if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit('expected board header rule not found')

path.write_text(text.replace(old, new, 1), encoding='utf-8')
