from pathlib import Path

path = Path('index.html')
html = path.read_text(encoding='utf-8')

old = """.board {
  gap: 10px;
  padding: 12px 16px 18px;
  min-height: calc(100vh - 96px);
  scroll-padding-left: 16px;
}
"""
new = """.board {
  gap: 10px;
  padding: 12px 16px 18px;
  height: calc(100vh - 96px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scroll-padding-left: 16px;
}
.tag-filter-bar.show + .board {
  height: calc(100vh - 130px);
}
"""

if old not in html:
    raise SystemExit('workbench board CSS anchor missing')

path.write_text(html.replace(old, new, 1), encoding='utf-8')
