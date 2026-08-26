from pathlib import Path
import re

css = Path('assets/workspace-v2.css').read_text(encoding='utf-8')


def block(selector: str) -> str:
    match = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', css, re.S)
    assert match, f'missing selector: {selector}'
    return match.group(1)


def font_size(selector: str) -> float:
    body = block(selector)
    match = re.search(r'font-size:\s*([0-9.]+)px', body)
    assert match, f'missing font-size: {selector}'
    return float(match.group(1))

# The board must expose an obvious horizontal scrolling surface inside the
# workspace viewport so the rightmost customer stages remain reachable.
board = block('.workspace-view[data-view="board"] .board')
assert re.search(r'overflow-x:\s*scroll', board), 'board must keep a persistent horizontal scrollbar'
assert re.search(r'scrollbar-gutter:\s*stable', board), 'board should reserve scrollbar space'
assert '.workspace-view[data-view="board"] .board::-webkit-scrollbar' in css
assert 'height: 14px' in css
assert '横向滚动查看右侧栏目' in css

# Workspace pages are used for long desktop sessions. Small 8–11px UI copy is
# not an acceptable baseline outside the dense customer board.
minimums = {
    '.workspace-page-subtitle': 12,
    '.workspace-quick-search': 13,
    '.ws-btn': 12,
    '.ws-panel-title': 15,
    '.ws-panel-note': 12,
    '.work-task-title': 14,
    '.work-task-meta': 11,
    '.radar-label': 13,
    '.radar-hint': 11,
    '.crm-task-action': 12,
    '.crm-task-time': 11,
    '.search-result-note': 12,
    '.analytics-kpi-label': 11,
    '.batch-action-card p': 12,
    '.ws-empty': 12,
}

for selector, minimum in minimums.items():
    actual = font_size(selector)
    assert actual >= minimum, f'{selector} is {actual}px, expected at least {minimum}px'

print('Workspace v2 readability contract OK')
