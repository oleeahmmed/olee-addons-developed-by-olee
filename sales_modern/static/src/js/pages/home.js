/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registerModernHome } from "@modern_theme/js/modern_home";

registerModernHome("sales_modern.home", {
    title: _t("Sales"),
    subtitle: _t("Jump to your everyday sales screens."),
    create: { resModel: "sale.order", label: _t("New quotation") },
    cards: [
        { action: "sales_modern.action_quotations", icon: "fa-file-text-o", label: _t("Quotations"), hint: _t("Draft offers") },
        { action: "sales_modern.action_orders", icon: "fa-shopping-cart", label: _t("Sales Orders"), hint: _t("Confirmed orders") },
        { action: "sales_modern.action_to_invoice", icon: "fa-file-text", label: _t("To Invoice"), hint: _t("Bill delivered orders") },
        { action: "sales_modern.action_customers", icon: "fa-address-book-o", label: _t("Customers"), hint: _t("Contacts") },
        { action: "sales_modern.action_dashboard", icon: "fa-th-large", label: _t("Dashboard"), hint: _t("KPIs and charts") },
    ],
});
