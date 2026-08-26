from pathlib import Path

js_path = Path('assets/workspace-v2.js')
css_path = Path('assets/workspace-v2.css')
js = js_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')

fn_marker = 'function ensureBoardScrollControls()'
css_marker = '/* explicit board scroll controls */'

if fn_marker not in js:
    build_marker = "    boardView.appendChild(legacyBoard);\n"
    if build_marker not in js:
        raise SystemExit('buildShell board marker not found')
    js = js.replace(build_marker, build_marker + "    ensureBoardScrollControls();\n", 1)

    nav_marker = "  function navButton(route, icon, label) {"
    if nav_marker not in js:
        raise SystemExit('navButton marker not found')

    controls_fn = r'''  function ensureBoardScrollControls() {
    const board = document.getElementById('board');
    const taskBar = document.getElementById('taskBar');
    if (!board || !taskBar) return;

    let controls = document.getElementById('workspaceBoardScrollControls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'workspace-board-scroll-controls';
      controls.id = 'workspaceBoardScrollControls';
      controls.setAttribute('aria-label', '客户看板横向移动');
      controls.innerHTML = `
        <button class="workspace-board-scroll-btn" id="workspaceBoardScrollLeft" type="button" aria-label="向左查看客户栏目">← 左移</button>
        <button class="workspace-board-scroll-btn" id="workspaceBoardScrollRight" type="button" aria-label="向右查看客户栏目">右移 →</button>`;
      taskBar.appendChild(controls);
      controls.querySelector('#workspaceBoardScrollLeft').addEventListener('click', () => scrollBoardByColumn(-1));
      controls.querySelector('#workspaceBoardScrollRight').addEventListener('click', () => scrollBoardByColumn(1));
    }

    if (!board.dataset.workspaceScrollBound) {
      board.dataset.workspaceScrollBound = '1';
      board.addEventListener('scroll', syncBoardScrollControls, { passive: true });
      addEventListener('resize', syncBoardScrollControls, { passive: true });
    }
    syncBoardScrollControls();
  }

  function scrollBoardByColumn(direction) {
    const board = document.getElementById('board');
    if (!board) return;
    const column = board.querySelector('.column');
    const boardStyle = getComputedStyle(board);
    const gap = parseFloat(boardStyle.columnGap || boardStyle.gap) || 10;
    const step = column ? column.getBoundingClientRect().width + gap : Math.max(320, board.clientWidth * .72);
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    const target = Math.max(0, Math.min(max, board.scrollLeft + direction * step));
    board.scrollTo({ left: target, behavior: 'smooth' });
    setTimeout(syncBoardScrollControls, 360);
  }

  function syncBoardScrollControls() {
    const board = document.getElementById('board');
    const left = document.getElementById('workspaceBoardScrollLeft');
    const right = document.getElementById('workspaceBoardScrollRight');
    if (!board || !left || !right) return;
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    left.disabled = board.scrollLeft <= 4;
    right.disabled = max <= 4 || board.scrollLeft >= max - 4;
  }

'''
    js = js.replace(nav_marker, controls_fn + nav_marker, 1)

    route_marker = "    if (state.route === 'board' && legacyRender) legacyRender();"
    if route_marker not in js:
        raise SystemExit('board render route marker not found')
    js = js.replace(route_marker, "    if (state.route === 'board' && legacyRender) { legacyRender(); ensureBoardScrollControls(); }", 1)

if css_marker not in css:
    css += r'''

/* explicit board scroll controls */
.workspace-board-scroll-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.workspace-board-scroll-btn {
  min-width: 74px;
  height: 30px;
  padding: 0 10px;
  border: 1.5px solid var(--ws-line);
  border-radius: 6px;
  background: #fffdf7;
  color: var(--ws-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 2px 2px 0 rgba(21,21,21,.12);
}
.workspace-board-scroll-btn:hover:not(:disabled) {
  transform: translate(-1px,-1px);
  box-shadow: 3px 3px 0 rgba(21,21,21,.16);
  background: #fff7d6;
}
.workspace-board-scroll-btn:disabled {
  cursor: default;
  opacity: .34;
  box-shadow: none;
}
.workspace-view[data-view="board"] .task-bar::after {
  content: "不用触控板，点左右按钮切换栏目";
  margin-left: 6px;
  padding-left: 0;
  font-size: 11px;
  white-space: nowrap;
}
'''

js_path.write_text(js, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
print('Applied explicit board scroll controls')
