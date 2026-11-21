#!/usr/bin/env bash
# Sakina auf dem eigenen Ubuntu-Server einrichten.
# Aufruf (im Repo-Ordner):   ./deploy/install.sh
# Danach läuft:
#   - sakina.service          (der kleine Server, startet automatisch)
#   - sakina-update.timer     (holt alle 2 Minuten neue Versionen von GitHub)
#   - tailscale serve         (HTTPS-Adresse nur für deine Geräte)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
DATA_DIR="${SAKINA_DATA:-/var/lib/sakina}"
PORT="${SAKINA_PORT:-8787}"

say() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null || { echo "Fehlt: $1  →  $2"; exit 1; }; }

need git "sudo apt install git"
need python3 "sudo apt install python3"
[ -f "$APP_DIR/index.html" ] || { echo "Bitte im Sakina-Repo ausführen."; exit 1; }

say "Datenordner $DATA_DIR"
sudo mkdir -p "$DATA_DIR"
sudo chown "$RUN_USER":"$RUN_USER" "$DATA_DIR"
sudo chmod 700 "$DATA_DIR"

ENV_FILE=/etc/sakina.env
if [ ! -f "$ENV_FILE" ]; then
  say "Einstellungen $ENV_FILE"
  sudo tee "$ENV_FILE" >/dev/null <<CONF
SAKINA_HOST=127.0.0.1
SAKINA_PORT=$PORT
SAKINA_DATA=$DATA_DIR
SAKINA_KEEP=90
# Optional: Token, den die App mitschicken muss (in der App unter ⚙️ eintragen)
SAKINA_TOKEN=
CONF
  sudo chmod 640 "$ENV_FILE"
  sudo chown root:"$RUN_USER" "$ENV_FILE"
fi

say "Dienst sakina.service"
sudo tee /etc/systemd/system/sakina.service >/dev/null <<UNIT
[Unit]
Description=Sakina (App + Backups)
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/python3 $APP_DIR/server/sakina_server.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DATA_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

say "Automatische Updates (sakina-update.timer)"
sudo tee /etc/systemd/system/sakina-update.service >/dev/null <<UNIT
[Unit]
Description=Sakina von GitHub aktualisieren

[Service]
Type=oneshot
User=$RUN_USER
ExecStart=$APP_DIR/deploy/update.sh
UNIT
sudo tee /etc/systemd/system/sakina-update.timer >/dev/null <<UNIT
[Unit]
Description=Sakina alle 2 Minuten aktualisieren

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
UNIT
# update.sh darf den Server nach einem Update neu starten
echo "$RUN_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart sakina.service" | sudo tee /etc/sudoers.d/sakina >/dev/null
sudo chmod 440 /etc/sudoers.d/sakina

sudo systemctl daemon-reload
sudo systemctl enable --now sakina.service sakina-update.timer

say "Test"
sleep 1
curl -fsS "http://127.0.0.1:$PORT/api/health" && echo

if command -v tailscale >/dev/null; then
  say "HTTPS über Tailscale"
  sudo tailscale serve --bg "$PORT" || echo "Tipp: In der Tailscale-Admin-Konsole unter DNS 'HTTPS Certificates' aktivieren und nochmal starten."
  tailscale serve status || true
else
  echo "Tailscale nicht gefunden. Installieren: curl -fsSL https://tailscale.com/install.sh | sh"
fi

say "Fertig. Öffne die https://…ts.net-Adresse von oben auf dem iPhone (Tailscale an)."
