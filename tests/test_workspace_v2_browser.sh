#!/usr/bin/env bash
set -euo pipefail

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROME" ]]; then
  echo "Chrome/Chromium not found" >&2
  exit 1
fi

python -m http.server 8765 --bind 127.0.0.1 >/tmp/sellsman-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

COMMON=(--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=2500)

"$CHROME" "${COMMON[@]}" --dump-dom 'http://127.0.0.1:8765/#home' >/tmp/sellsman-home.html 2>/tmp/sellsman-home.err

grep -q 'class="workspace-shell' /tmp/sellsman-home.html
grep -q 'class="workspace-sidebar"' /tmp/sellsman-home.html
grep -q 'data-view="home"' /tmp/sellsman-home.html
grep -q 'workspace-view active" data-view="home"' /tmp/sellsman-home.html
grep -q '今日作战台' /tmp/sellsman-home.html
grep -q 'CRM 雷达' /tmp/sellsman-home.html
grep -q '今日计划' /tmp/sellsman-home.html
grep -q '明日计划' /tmp/sellsman-home.html
grep -q '任务历史' /tmp/sellsman-home.html
grep -q 'customer-drawer' /tmp/sellsman-home.html

grep -q 'id="board"' /tmp/sellsman-home.html
grep -q 'sales_work_tasks_v1' assets/workspace-v2.js

"$CHROME" "${COMMON[@]}" --dump-dom 'http://127.0.0.1:8765/#board' >/tmp/sellsman-board.html 2>/tmp/sellsman-board.err
grep -q 'workspace-view active" data-view="board"' /tmp/sellsman-board.html
grep -q '客户看板' /tmp/sellsman-board.html
grep -q '沉默用户' /tmp/sellsman-board.html

# Runtime geometry probe: normal desktop must fit all five columns with no
# horizontal overflow; narrower desktop keeps the legacy horizontal fallback
# and explicit mouse controls for users without a trackpad gesture.
PROBE_COMMON=(--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=9500 --window-size=1500,2100)
"$CHROME" "${PROBE_COMMON[@]}" --dump-dom 'http://127.0.0.1:8765/tests/board_scroll_probe.html' >/tmp/sellsman-board-probe.html 2>/tmp/sellsman-board-probe.err
printf 'Board responsive probe: '
grep -o '{"[^<]*}' /tmp/sellsman-board-probe.html | head -1 || { echo 'no JSON result'; tail -80 /tmp/sellsman-board-probe.html; }
grep -q 'id="result-done"' /tmp/sellsman-board-probe.html
grep -q '"desktopNoOverflow":true' /tmp/sellsman-board-probe.html
grep -q '"desktopFirstColumnVisible":true' /tmp/sellsman-board-probe.html
grep -q '"desktopLastColumnVisible":true' /tmp/sellsman-board-probe.html
grep -q '"desktopFits":true' /tmp/sellsman-board-probe.html
grep -q '"desktopBottomVisible":true' /tmp/sellsman-board-probe.html
grep -q '"desktopColumnCount":5' /tmp/sellsman-board-probe.html
grep -q '"narrowCanOverflow":true' /tmp/sellsman-board-probe.html
grep -q '"narrowDirectScrollWorks":true' /tmp/sellsman-board-probe.html
grep -q '"narrowLastColumnVisibleAfterDirectScroll":true' /tmp/sellsman-board-probe.html
grep -q '"narrowBottomVisible":true' /tmp/sellsman-board-probe.html
grep -q '"narrowControlsPresent":true' /tmp/sellsman-board-probe.html
grep -q '"narrowButtonScrollWorks":true' /tmp/sellsman-board-probe.html
grep -q '"narrowColumnCount":5' /tmp/sellsman-board-probe.html

# Runtime drag probe: the card must move/save immediately without a synchronous
# whole-board render, while at most one idle reconciliation may happen afterward.
DRAG_COMMON=(--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=9000 --window-size=1500,1000)
"$CHROME" "${DRAG_COMMON[@]}" --dump-dom 'http://127.0.0.1:8765/tests/board_drag_probe.html' >/tmp/sellsman-drag-probe.html 2>/tmp/sellsman-drag-probe.err
printf 'Board drag probe: '
grep -o '{"[^<]*}' /tmp/sellsman-drag-probe.html | head -1 || { echo 'no JSON result'; tail -80 /tmp/sellsman-drag-probe.html; }
grep -q 'id="result-done"' /tmp/sellsman-drag-probe.html
grep -q '"optimizedLayerLoaded":true' /tmp/sellsman-drag-probe.html
grep -q '"dragClassDuring":true' /tmp/sellsman-drag-probe.html
grep -q '"pointerEventsDuring":"none"' /tmp/sellsman-drag-probe.html
grep -q '"activeHighlightsDuring":1' /tmp/sellsman-drag-probe.html
grep -q '"movedImmediately":true' /tmp/sellsman-drag-probe.html
grep -q '"renderCallsImmediate":0' /tmp/sellsman-drag-probe.html
grep -q '"dragClassAfterDrop":false' /tmp/sellsman-drag-probe.html
grep -q '"highlightCountAfterDrop":0' /tmp/sellsman-drag-probe.html
grep -q '"persistedImmediately":true' /tmp/sellsman-drag-probe.html
grep -q '"persistedAfterIdle":true' /tmp/sellsman-drag-probe.html

mkdir -p /tmp/workspace-v2-shots
"$CHROME" "${COMMON[@]}" --window-size=1440,900 --screenshot=/tmp/workspace-v2-shots/home-1440.png 'http://127.0.0.1:8765/#home' >/dev/null 2>/tmp/sellsman-shot-home.err
"$CHROME" "${COMMON[@]}" --window-size=1920,1080 --screenshot=/tmp/workspace-v2-shots/home-1920.png 'http://127.0.0.1:8765/#home' >/dev/null 2>/tmp/sellsman-shot-home-wide.err
"$CHROME" "${COMMON[@]}" --window-size=1440,900 --screenshot=/tmp/workspace-v2-shots/board-1440.png 'http://127.0.0.1:8765/#board' >/dev/null 2>/tmp/sellsman-shot-board.err
"$CHROME" "${COMMON[@]}" --window-size=1920,1080 --screenshot=/tmp/workspace-v2-shots/board-1920.png 'http://127.0.0.1:8765/#board' >/dev/null 2>/tmp/sellsman-shot-board-wide.err

# A runtime crash normally prevents the shell/home content from appearing;
# screenshots are uploaded by CI for visual inspection.
echo 'Workspace v2 browser smoke OK'
