#!/bin/bash
# Puts a one-command wrapper at /var/www/odoo/update.sh
set -euo pipefail
ROOT="${ODOO_ROOT:-/var/www/odoo}"
cat >"$ROOT/update.sh" <<'EOF'
#!/bin/bash
set -euo pipefail
cd /var/www/odoo/extra-addons
git fetch origin
git checkout -B main origin/main
git reset --hard origin/main
exec bash /var/www/odoo/extra-addons/deploy/odoo-update.sh --skip-pull
EOF
chmod 755 "$ROOT/update.sh"
echo "Installed $ROOT/update.sh"
echo "Run: bash /var/www/odoo/update.sh"
