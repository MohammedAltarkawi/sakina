#!/usr/bin/env bash
# Holt die neueste Version von GitHub. Startet den Server nur neu, wenn sich server/ geändert hat.
set -euo pipefail
cd "$(dirname "$0")/.."
before=$(git rev-parse HEAD)
git pull -q --ff-only
after=$(git rev-parse HEAD)
if [ "$before" != "$after" ]; then
  echo "Aktualisiert: ${before:0:7} → ${after:0:7}"
  if ! git diff --quiet "$before" "$after" -- server/; then
    sudo -n /usr/bin/systemctl restart sakina.service && echo "Server neu gestartet"
  fi
fi
