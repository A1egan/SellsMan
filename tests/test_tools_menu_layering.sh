#!/usr/bin/env bash
set -euo pipefail

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROME" ]]; then
  echo "Chrome/Chromium not found" >&2
  exit 1
fi

python -m http.server 8766 --bind 127.0.0.1 >/tmp/sellsman-menu-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

COMMON=(--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=7500 --window-size=1500,1000)
"$CHROME" "${COMMON[@]}" --dump-dom 'http://127.0.0.1:8766/tests/tools_menu_layer_probe.html' >/tmp/sellsman-menu-probe.html 2>/tmp/sellsman-menu-probe.err

printf 'Tools menu layering probe: '
grep -o '{"[^<]*}' /tmp/sellsman-menu-probe.html | head -1 || { echo 'no JSON result'; tail -80 /tmp/sellsman-menu-probe.html; }
grep -q 'id="result-done"' /tmp/sellsman-menu-probe.html
grep -q '"overlapFound":true' /tmp/sellsman-menu-probe.html
grep -q '"topmostInMenu":true' /tmp/sellsman-menu-probe.html

echo 'Tools menu layering OK'
