from pathlib import Path
import re
import subprocess

html = Path('index.html').read_text(encoding='utf-8')

# Legacy data/function contracts must survive the redesign.
for token in [
    "const STORAGE_KEY = 'sales_followup_data_v3'",
    "const TAGS_KEY = 'sales_tags_v1'",
    'id="board"',
    'id="tagModal"',
    'id="detailResult"',
    'id="detailNextTime"',
    'id="detailNextAction"',
    'function onDrop(',
    'function batchMoveSelected(',
    'function logFollowup(',
    'function openTagModal(',
]:
    assert token in html, f'missing legacy contract token: {token}'

# Workspace v2 assets are loaded after the legacy engine.
for token in [
    'assets/workspace-v2.css',
    'assets/workspace-v2-core.js',
    'assets/workspace-v2.js',
]:
    assert token in html, f'missing workspace asset: {token}'

core_path = Path('assets/workspace-v2-core.js')
app_path = Path('assets/workspace-v2.js')
css_path = Path('assets/workspace-v2.css')
board_js_path = Path('assets/workspace-v2-board.js')
board_css_path = Path('assets/workspace-v2-board.css')
assert core_path.exists(), 'workspace core missing'
assert app_path.exists(), 'workspace app missing'
assert css_path.exists(), 'workspace css missing'
assert board_js_path.exists(), 'board enhancement JS missing'
assert board_css_path.exists(), 'board enhancement CSS missing'

core = core_path.read_text(encoding='utf-8')
app = app_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')
board_js = board_js_path.read_text(encoding='utf-8')
board_css = board_css_path.read_text(encoding='utf-8')

for route in ['home', 'tasks', 'board', 'search', 'analytics', 'batch']:
    assert route in app, f'missing route: {route}'

for token in [
    'sales_work_tasks_v1',
    'sales_workspace_sidebar_v1',
    'workspace-shell',
    'workspace-sidebar',
    'workspace-main',
    'crm-radar',
    'recent-customers',
    'customer-drawer',
    'wsTaskHistoryModal',
    'openTaskHistory',
    'tomorrowPlanned',
    '+ 工作计划',
]:
    assert token in app or token in css, f'missing workspace token: {token}'

# The core bootstrap loads the isolated board enhancement without touching the large legacy/app files.
assert 'workspace-v2-board.js' in core, 'board enhancement loader missing from workspace core bootstrap'

# Board density contract: normal desktop fits all five stages; wide desktop gets 3 cards/row.
for token in [
    'repeat(5, minmax(0, 1fr))',
    '@media (min-width: 1800px)',
    'repeat(3, minmax(0, 1fr))',
    'board-drag-active',
]:
    assert token in board_css, f'missing board layout/performance CSS token: {token}'

# Board drag contract: enhancement overrides legacy handlers and defers expensive reconciliation.
for token in [
    'installBoardDragOptimizations',
    'scheduleBoardReconcile',
    'boardDragId',
    'globalThis.onDragStart',
    'globalThis.onDragOver',
    'globalThis.onDrop',
    'requestIdleCallback',
    'appendChild',
]:
    assert token in board_js, f'missing optimized board drag token: {token}'

drop_match = re.search(r'globalThis\.onDrop\s*=\s*function\s*\([^)]*\)\s*\{(?P<body>.*?)\n\s*\};', board_js, re.S)
assert drop_match, 'optimized onDrop override missing'
drop_body = drop_match.group('body')
assert 'render()' not in drop_body, 'drop must not synchronously full-render the board'
assert 'scheduleBoardReconcile' in drop_body, 'drop should only queue reconciliation when needed'

for fn in [
    'normalizeRoute',
    'normalizeTask',
    'createTask',
    'getRolloverCandidates',
    'activateTasks',
    'deferTasks',
    'completeTasks',
    'reopenTasks',
    'sortTasks',
    'partitionTasks',
]:
    assert fn in core, f'missing core function: {fn}'

subprocess.run(['node', '--check', str(core_path)], check=True)
subprocess.run(['node', '--check', str(app_path)], check=True)
subprocess.run(['node', '--check', str(board_js_path)], check=True)

print('Workspace v2 contract OK')
