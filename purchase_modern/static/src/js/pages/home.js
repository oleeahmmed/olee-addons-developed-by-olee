/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registerModernHome } from "@modern_theme/js/modern_home";

registerModernHome("purchase_modern.home", {
    title: _t("Purchase"),
    subtitle: _t("Jump to your everyday purchasing screens."),
    cards: [
        { action: "purchase_modern.action_rfqs", icon: "fa-file-text-o", label: _t("RFQs"), hint: _t("Request quotes") },
        { action: "purchase_modern.action_orders", icon: "fa-shopping-cart", label: _t("Purchase Orders"), hint: _t("Confirmed POs") },
        { action: "purchase_modern.action_to_bill", icon: "fa-file-text", label: _t("To Bill"), hint: _t("Vendor bills") },
        { action: "purchase_modern.action_vendors", icon: "fa-address-book-o", label: _t("Vendors"), hint: _t("Suppliers") },
        { action: "purchase_modern.action_dashboard", icon: "fa-th-large", label: _t("Dashboard"), hint: _t("Overview") },
    ],
});
