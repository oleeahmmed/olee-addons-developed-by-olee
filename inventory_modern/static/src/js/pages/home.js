/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registerModernHome } from "@modern_theme/js/modern_home";

registerModernHome("inventory_modern.home", {
    title: _t("Inventory"),
    subtitle: _t("Jump to your everyday inventory screens."),
    cards: [
        { action: "inventory_modern.action_receipts", icon: "fa-truck", label: _t("Receipts"), hint: _t("Incoming goods") },
        { action: "inventory_modern.action_deliveries", icon: "fa-send", label: _t("Deliveries"), hint: _t("Outgoing goods") },
        { action: "inventory_modern.action_products", icon: "fa-cube", label: _t("Products"), hint: _t("Catalog") },
        { action: "inventory_modern.action_stock", icon: "fa-cubes", label: _t("Stock on Hand"), hint: _t("Quantities") },
        { action: "inventory_modern.action_dashboard", icon: "fa-th-large", label: _t("Dashboard"), hint: _t("Overview") },
    ],
});
