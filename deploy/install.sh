#!/usr/bin/env bash
# Sakina auf dem eigenen Ubuntu-Server einrichten.
# Aufruf (im Repo-Ordner):   ./deploy/install.sh
# Danach läuft:
#   - sakina.service          (der kleine Server, startet automatisch)
#   - sakina-update.timer     (holt regelmäßig neue Versionen von GitHub, Standard 1 h)
#   - tailscale serve         (HTTPS-Adresse nur für deine Geräte)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
CLAUDE_BIN="$(sudo -u "$RUN_USER" bash -lc 'command -v claude' 2>/dev/null || true)"
[ -z "$CLAUDE_BIN" ] && [ -x "$RUN_HOME/.local/bin/claude" ] && CLAUDE_BIN="$RUN_HOME/.local/bin/claude"
DATA_DIR="${SAKINA_DATA:-/var/lib/sakina}"
PORT="${SAKINA_PORT:-8787}"
# Eigener HTTPS-Port, damit andere Dienste auf 443 (z. B. Open WebUI) unangetastet bleiben
HTTPS_PORT="${SAKINA_HTTPS_PORT:-8443}"

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
# Claude Code im Terminal (für Wochenplan, Analyse, Übungs-Check, Fakten)
SAKINA_CLAUDE=$CLAUDE_BIN
# Optional: bestimmtes Modell, z. B. sonnet
SAKINA_CLAUDE_MODEL=
CONF
  sudo chmod 640 "$ENV_FILE"
  sudo chown root:"$RUN_USER" "$ENV_FILE"
fi

if ! sudo grep -q '^SAKINA_CLAUDE=' "$ENV_FILE"; then
  printf '\n# Claude Code im Terminal\nSAKINA_CLAUDE=%s\nSAKINA_CLAUDE_MODEL=\n' "$CLAUDE_BIN" | sudo tee -a "$ENV_FILE" >/dev/null
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
# Claude Code braucht Schreibzugriff auf seine Anmeldung/Einstellungen
ReadWritePaths=$DATA_DIR -$RUN_HOME/.claude -$RUN_HOME/.claude.json -$RUN_HOME/.config/claude -$RUN_HOME/.cache
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

# Update-Intervall: Umgebungsvariable > bereits eingestellter Wert > 1 Stunde
UPDATE_EVERY="${SAKINA_UPDATE_EVERY:-$(sed -n 's/^OnUnitActiveSec=//p' /etc/systemd/system/sakina-update.timer 2>/dev/null)}"
UPDATE_EVERY="${UPDATE_EVERY:-1h}"
say "Automatische Updates (sakina-update.timer, alle $UPDATE_EVERY)"
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
Description=Sakina regelmäßig aktualisieren

[Timer]
OnBootSec=1min
OnUnitActiveSec=$UPDATE_EVERY

[Install]
WantedBy=timers.target
UNIT
# update.sh darf den Server nach einem Update neu starten
echo "$RUN_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart sakina.service" | sudo tee /etc/sudoers.d/sakina >/dev/null
sudo chmod 440 /etc/sudoers.d/sakina

say "Claude-Jobs (Fr Wochenplan, So Analyse, monatlich Übungs-Check)"
sudo tee /etc/systemd/system/sakina-job@.service >/dev/null <<UNIT
[Unit]
Description=Sakina Claude-Job %i

[Service]
Type=oneshot
User=$RUN_USER
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/python3 $APP_DIR/server/claude_jobs.py %i --trigger timer
TimeoutStartSec=15min
UNIT
make_timer() { # name, OnCalendar
  sudo tee "/etc/systemd/system/sakina-job-$1.timer" >/dev/null <<UNIT
[Unit]
Description=Sakina Claude-Job $1

[Timer]
OnCalendar=$2
Persistent=true
Unit=sakina-job@$1.service

[Install]
WantedBy=timers.target
UNIT
}
make_timer plan      "Fri *-*-* 18:00:00"
make_timer analysis  "Sun *-*-* 19:00:00"
make_timer exercises "*-*-01 10:00:00"

sudo systemctl daemon-reload
sudo systemctl enable --now sakina.service sakina-update.timer sakina-job-plan.timer sakina-job-analysis.timer sakina-job-exercises.timer
sudo systemctl restart sakina.service

if [ -n "$CLAUDE_BIN" ]; then
  say "Claude gefunden: $CLAUDE_BIN"
  echo "Test: sudo systemctl start sakina-job@analysis && journalctl -u sakina-job@analysis -n 20"
else
  echo "⚠️  claude nicht gefunden. Installieren und einloggen (als $RUN_USER), dann SAKINA_CLAUDE in $ENV_FILE eintragen."
fi

say "Test"
sleep 1
curl -fsS "http://127.0.0.1:$PORT/api/health" && echo

if command -v tailscale >/dev/null; then
  say "HTTPS über Tailscale"
  say "HTTPS über Tailscale auf Port $HTTPS_PORT (443 und alles andere bleibt, wie es ist)"
  sudo tailscale serve --bg --https="$HTTPS_PORT" "http://127.0.0.1:$PORT" \
    || echo "Tipp: In der Tailscale-Admin-Konsole unter DNS 'HTTPS Certificates' aktivieren und nochmal starten."
  tailscale serve status || true
  HOST="$(tailscale status --json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || true)"
  [ -n "$HOST" ] && echo "👉 Sakina: https://$HOST:$HTTPS_PORT"
else
  echo "Tailscale nicht gefunden. Installieren: curl -fsSL https://tailscale.com/install.sh | sh"
fi

say "Fertig. Öffne die https://…ts.net-Adresse von oben auf dem iPhone (Tailscale an)."
