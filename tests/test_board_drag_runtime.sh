#!/usr/bin/env bash
set -euo pipefail

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROME" ]]; then
  echo "Chrome/Chromium not found" >&2
  exit 1
fi

python -m http.server 8768 --bind 127.0.0.1 >/tmp/sellsman-drag-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

COMMON=(--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=9000 --window-size=1500,1000)
"$CHROME" "${COMMON[@]}" --dump-dom 'http://127.0.0.1:8768/tests/board_drag_performance_probe.html' >/tmp/sellsman-drag-probe.html 2>/tmp/sellsman-drag-probe.err

printf 'Board drag performance probe: '
grep -o '{"sourceId"[^<]*}\|{"error"[^<]*}' /tmp/sellsman-drag-probe.html | head -1 || { echo 'no JSON result'; tail -80 /tmp/sellsman-drag-probe.html; }
grep -q 'id="result-done"' /tmp/sellsman-drag-probe.html
grep -q '"optimized":true' /tmp/sellsman-drag-probe.html

echo 'Board drag performance OK'
