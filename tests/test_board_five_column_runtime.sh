#!/usr/bin/env bash
set -euo pipefail

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROME" ]]; then
  echo "Chrome/Chromium not found" >&2
  exit 1
fi

python -m http.server 8767 --bind 127.0.0.1 >/tmp/sellsman-five-col-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

COMMON=(--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=8500 --window-size=2100,1200)

run_probe() {
  local width="$1"
  local height="$2"
  local out="/tmp/sellsman-five-col-${width}.html"
  local err="/tmp/sellsman-five-col-${width}.err"
  "$CHROME" "${COMMON[@]}" --dump-dom "http://127.0.0.1:8767/tests/board_five_column_probe.html?w=${width}&h=${height}" >"$out" 2>"$err"
  printf 'Board %spx probe: ' "$width"
  grep -o '{"width"[^<]*}' "$out" | head -1 || { echo 'no JSON result'; tail -80 "$out"; }
  grep -q 'id="result-done"' "$out"
}

run_probe 1440 900
grep -q '"fit":true' /tmp/sellsman-five-col-1440.html
grep -q '"tracks":2' /tmp/sellsman-five-col-1440.html

run_probe 1920 1080
grep -q '"fit":true' /tmp/sellsman-five-col-1920.html
grep -q '"tracks":3' /tmp/sellsman-five-col-1920.html

run_probe 1200 900
grep -q '"fallbackOverflow":true' /tmp/sellsman-five-col-1200.html

echo 'Board five-column geometry OK'
