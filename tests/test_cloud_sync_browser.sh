#!/usr/bin/env bash
set -euo pipefail

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROME" ]]; then
  echo "Chrome/Chromium not found" >&2
  exit 1
fi

python -m http.server 8766 --bind 127.0.0.1 >/tmp/cloudsync-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1

"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=1800 --dump-dom \
  'http://127.0.0.1:8766/tests/cloud_sync_probe.html' >/tmp/cloudsync-probe.html 2>/tmp/cloudsync-probe.err

grep -q 'id="result-done"' /tmp/cloudsync-probe.html || { tail -80 /tmp/cloudsync-probe.html; exit 1; }
grep -q '&quot;localFirst&quot;:true' /tmp/cloudsync-probe.html
grep -q '&quot;pendingSurvives&quot;:true' /tmp/cloudsync-probe.html
grep -q '&quot;authSafe&quot;:true' /tmp/cloudsync-probe.html
grep -q '&quot;focusPull&quot;:true' /tmp/cloudsync-probe.html

echo 'Cloud sync browser probe OK'
