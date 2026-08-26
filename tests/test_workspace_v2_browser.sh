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

# Below the five-column desktop breakpoint, native horizontal overflow and
# explicit mouse controls remain the fallback for narrow windows.
PROBE_COMMON=(--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=7500 --window-size=1500,1000)
"$CHROME" "${PROBE_COMMON[@]}" --dump-dom 'http://127.0.0.1:8765/tests/board_scroll_probe.html' >/tmp/sellsman-board-probe.html 2>/tmp/sellsman-board-probe.err
printf 'Board scroll probe: '
grep -o '{"[^<]*}' /tmp/sellsman-board-probe.html | head -1 || { echo 'no JSON result'; tail -80 /tmp/sellsman-board-probe.html; }
grep -q 'id="result-done"' /tmp/sellsman-board-probe.html
grep -q '"viewportWidth":1200' /tmp/sellsman-board-probe.html
grep -q '"canOverflow":true' /tmp/sellsman-board-probe.html
grep -q '"directScrollWorks":true' /tmp/sellsman-board-probe.html
grep -q '"bottomVisible":true' /tmp/sellsman-board-probe.html
grep -q '"lastColumnVisibleAfterDirectScroll":true' /tmp/sellsman-board-probe.html
grep -q '"controlsPresent":true' /tmp/sellsman-board-probe.html
grep -q '"buttonScrollWorks":true' /tmp/sellsman-board-probe.html

mkdir -p /tmp/workspace-v2-shots
"$CHROME" "${COMMON[@]}" --window-size=1440,900 --screenshot=/tmp/workspace-v2-shots/home-1440.png 'http://127.0.0.1:8765/#home' >/dev/null 2>/tmp/sellsman-shot-home.err
"$CHROME" "${COMMON[@]}" --window-size=1920,1080 --screenshot=/tmp/workspace-v2-shots/home-1920.png 'http://127.0.0.1:8765/#home' >/dev/null 2>/tmp/sellsman-shot-home-wide.err
"$CHROME" "${COMMON[@]}" --window-size=1440,900 --screenshot=/tmp/workspace-v2-shots/board-1440.png 'http://127.0.0.1:8765/#board' >/dev/null 2>/tmp/sellsman-shot-board.err
"$CHROME" "${COMMON[@]}" --window-size=1920,1080 --screenshot=/tmp/workspace-v2-shots/board-1920.png 'http://127.0.0.1:8765/#board' >/dev/null 2>/tmp/sellsman-shot-board-wide.err

# A runtime crash normally prevents the shell/home content from appearing;
# screenshots are uploaded by CI for visual inspection.
echo 'Workspace v2 browser smoke OK'
