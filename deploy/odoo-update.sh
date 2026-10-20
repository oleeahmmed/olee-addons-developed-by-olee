#!/bin/bash
# One-shot VPS deploy: pull addons, upgrade installed modern modules, start Odoo.
# Install once as /var/www/odoo/update.sh (see footer). Then: bash /var/www/odoo/update.sh
set -euo pipefail

ROOT="${ODOO_ROOT:-/var/www/odoo}"
ADDONS="${ODOO_ADDONS:-$ROOT/extra-addons}"
CONF="${ODOO_CONF:-/etc/odoo19.conf}"
PYTHON="${ODOO_PYTHON:-$ROOT/venv/bin/python}"
BIN="${ODOO_BIN:-$ROOT/odoo/odoo-bin}"
SERVICE="${ODOO_SERVICE:-odoo19}"
FS="${ODOO_FILESTORE:-$ROOT/filestore/filestore}"
KNOWN_DBS="${ODOO_DBS:-rebelsoft crm olee}"
KNOWN_MODS="modern_theme,crm_modern,sales_modern,inventory_modern,purchase_modern,mrp_modern"

SKIP_PULL=0
if [[ "${1:-}" == "--skip-pull" ]]; then
  SKIP_PULL=1
fi

if [[ "$SKIP_PULL" -eq 0 ]]; then
  echo "==> pull $ADDONS"
  cd "$ADDONS"
  git fetch origin
  git checkout -B main origin/main
  git reset --hard origin/main
  git branch | grep -E '[[:space:]](admin|amin)$' && git branch -D admin amin || true
fi

echo "==> HEAD $(git -C "$ADDONS" rev-parse --short HEAD)"
git -C "$ADDONS" log -1 --oneline

echo "==> filestore"
mkdir -p "$FS/crm"
if [[ -d "$FS/rebelsoft" ]]; then
  cp -a --update=none "$FS/rebelsoft/." "$FS/crm/" 2>/dev/null \
    || cp -an "$FS/rebelsoft/." "$FS/crm/"
fi

echo "==> stop $SERVICE"
systemctl stop "$SERVICE" || true

upgrade_db() {
  local db="$1"
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    echo "    skip missing db $db"
    return 0
  fi
  local mods
  mods="$(sudo -u postgres psql -d "$db" -tAc \
    "SELECT string_agg(name, ',' ORDER BY name) FROM ir_module_module
     WHERE state = 'installed' AND name = ANY (string_to_array('$KNOWN_MODS', ','));")"
  mods="$(echo "$mods" | tr -d '[:space:]')"
  if [[ -z "$mods" ]]; then
    echo "    skip $db (no modern modules)"
    return 0
  fi
  echo "    upgrade $db: $mods"
  "$PYTHON" "$BIN" -c "$CONF" -d "$db" -u "$mods" --stop-after-init
}

echo "==> upgrade databases"
for db in $KNOWN_DBS; do
  upgrade_db "$db"
done

echo "==> start $SERVICE"
systemctl start "$SERVICE"
sleep 4
systemctl is-active "$SERVICE"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx
fi

echo "==> health"
curl -sI -H "Host: crm.ibitltd.com" http://127.0.0.1:8069/web/login | head -8 || true
echo "DONE $(git -C "$ADDONS" rev-parse --short HEAD)"
