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
grep -q 'customer-drawer' /tmp/sellsman-home.html

grep -q 'id="board"' /tmp/sellsman-home.html
grep -q 'sales_work_tasks_v1' assets/workspace-v2.js

"$CHROME" "${COMMON[@]}" --dump-dom 'http://127.0.0.1:8765/#board' >/tmp/sellsman-board.html 2>/tmp/sellsman-board.err
grep -q 'workspace-view active" data-view="board"' /tmp/sellsman-board.html
grep -q '客户看板' /tmp/sellsman-board.html
grep -q '沉默用户' /tmp/sellsman-board.html

# A runtime crash normally prevents the shell/home content from appearing;
# print Chrome diagnostics only after assertions succeed to keep CI readable.
echo 'Workspace v2 browser smoke OK'
