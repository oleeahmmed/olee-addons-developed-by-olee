/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registerModernHome } from "@modern_theme/js/modern_home";

registerModernHome("mrp_modern.home", {
    title: _t("Manufacturing"),
    subtitle: _t("Jump to your everyday manufacturing screens."),
    create: { resModel: "mrp.production", label: _t("New manufacturing order") },
    cards: [
        { action: "mrp_modern.action_todo", icon: "fa-list", label: _t("To Do"), hint: _t("Open manufacturing orders") },
        { action: "mrp_modern.action_mos", icon: "fa-industry", label: _t("Manufacturing Orders"), hint: _t("Every MO") },
        { action: "mrp_modern.action_boms", icon: "fa-sitemap", label: _t("Bills of Materials"), hint: _t("How products are built") },
        { action: "mrp_modern.action_products", icon: "fa-cube", label: _t("Products"), hint: _t("What you manufacture") },
        { action: "mrp_modern.action_dashboard", icon: "fa-th-large", label: _t("Dashboard"), hint: _t("KPIs and charts") },
    ],
});
