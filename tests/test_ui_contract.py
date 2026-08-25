from pathlib import Path
import re
import subprocess
import tempfile

html = Path('index.html').read_text(encoding='utf-8')

required = [
    "const STORAGE_KEY = 'sales_followup_data_v3'",
    "const TAGS_KEY = 'sales_tags_v1'",
    'id="toolsMenuBtn"',
    'id="taskBar"',
    'id="board"',
    'id="detailResult"',
    'id="detailNextTime"',
    'id="detailNextAction"',
    'function onDrop(',
    'function batchMoveSelected(',
    'function logFollowup(',
    'function renderTagModal(',
]
for token in required:
    assert token in html, f'missing contract token: {token}'

assert re.search(
    r'\.column-body\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)',
    html,
    re.S,
), 'all columns must use a 3-card grid'
assert 'class="stats-bar"' not in html, 'standalone stats bar should be removed'
assert 'data-followup-status=' in html, 'cards must expose follow-up status for visual priority'
assert 'id="detailColumnBadge"' in html, 'detail summary must show current column'
assert 'id="detailTagSummary"' in html, 'detail summary must show tag summary'

# Keep the desktop board itself as the scroll viewport. Otherwise its
# horizontal scrollbar falls below long columns and the right-most stage is
# effectively unreachable during normal laptop use.
workbench = html.split('/* ====== 高密度销售工作台 · 2026-08 ====== */', 1)[1]
assert re.search(
    r'\.board\s*\{[^}]*height\s*:\s*calc\(100vh\s*-\s*96px\)[^}]*overflow\s*:\s*auto',
    workbench,
    re.S,
), 'board must be a viewport-height two-axis scroll container'

script_match = re.search(r'<script>(.*)</script>', html, re.S)
assert script_match, 'script block missing'
with tempfile.NamedTemporaryFile('w', suffix='.js', encoding='utf-8', delete=False) as f:
    f.write(script_match.group(1))
    script_path = f.name
subprocess.run(['node', '--check', script_path], check=True)

print('UI contract OK')
