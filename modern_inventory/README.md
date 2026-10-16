# Modern Inventory (`modern_inventory`)

Modern UI for Odoo 19 **Inventory** — same idea as Modern CRM: sidebar, dashboard, and list pages that **embed Odoo’s own** stock views (search, filters, pager, forms). No new models or stored fields.

| Page | Built on |
|------|-----------|
| Dashboard | `stock.picking.modern_inventory_dashboard()` — KPIs, ops by type, charts, attention list |
| Receipts / Deliveries / Internal | `stock.picking` + standard tree/kanban/calendar/activity views |
| Products / Stock on hand / Moves | `product.template`, `stock.quant`, `stock.move.line` standard views |

**Technical name:** `modern_inventory` (Apps list: **Modern Inventory**).  
**URL paths:** `/odoo/modern-inventory`, `/odoo/modern-inventory-receipts`, …

## Install

```bash
odoo-bin -c odoo.conf -d <db> -i modern_inventory --stop-after-init
```

### Apps → **Update Apps List** (UI)

1. **Settings** → scroll down → **Developer Tools** → **Activate the developer mode**  
2. Open **Apps** → top menu **⋮** (or **Update Apps List** on the kanban) → **Update Apps List**  
3. Remove the “Apps” filter if needed, search **Modern Inventory**, click **Activate**

If the module does not appear after Update Apps List, check that `__manifest__.py` has **no UTF-8 BOM** (Odoo silently skips the addon). Re-save the manifest as UTF-8 without BOM.

After rename from `inventory_modern`: update apps list, install **Modern Inventory** (not the old name).

## “Odoo is currently processing another module operation”

This is **not** a bug in this addon’s Python/XML. Odoo blocks install/activate when:

1. Another module is stuck in **`to install` / `to upgrade` / `to remove`**, or  
2. Another browser tab / CLI is upgrading modules, or  
3. A **cron** job holds `ir_cron` (less common).

**Fix (maintenance window):**

1. Stop Odoo (all workers).  
2. In PostgreSQL (replace `your_db`):

```sql
-- See stuck modules
SELECT name, state FROM ir_module_module
WHERE state IN ('to install', 'to upgrade', 'to remove');

-- If a failed install left a ghost (only when Odoo is stopped):
UPDATE ir_module_module SET state = 'uninstalled'
WHERE name = 'inventory_modern' AND state IN ('to install', 'to upgrade', 'to remove');

UPDATE ir_module_module SET state = 'uninstalled'
WHERE name = 'modern_inventory' AND state IN ('to install', 'to upgrade', 'to remove');
```

3. Start Odoo → Apps → Update Apps List → Install **Modern Inventory** again.

Or from CLI (Odoo stopped, one process):

```bash
odoo-bin -c odoo.conf -d your_db -i modern_inventory --stop-after-init
```

## Upgrade check

```bash
odoo-bin -c odoo.conf -d <db> -u modern_inventory --test-tags /modern_inventory --stop-after-init
```

## Depends

`stock`, `mail` (standard Inventory stack).
