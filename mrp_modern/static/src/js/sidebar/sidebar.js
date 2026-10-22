import { registry } from "@web/core/registry";

/**
 * Manufacturing in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says
 * how to arrange this app: our groups first, Odoo's leftover entries merged into
 * them, entries we already show with a modern page hidden, and Reporting /
 * Configuration kept at the bottom, closed. Menus of apps that are not installed
 * do not exist in the database, so they can never appear.
 */
const APP_XMLID = "mrp.menu_mrp_root";
// Odoo top-level groups whose entries go into one of our groups
const MERGE_INTO = {
    "mrp.menu_mrp_reporting": "mrp_modern.menu_reporting",
    "mrp.menu_mrp_configuration": "mrp_modern.menu_config",
};
// In the top bar (not the sidebar): Reporting, Configuration and less used groups
const SECONDARY = new Set(["mrp_modern.menu_reporting", "mrp_modern.menu_config"]);
// Odoo entries already shown by a Manufacturing Modern page / menu on the same records
const REPLACED = new Set([
    "mrp.menu_mrp_production_action",
    "mrp.menu_mrp_unbuild",
    "mrp.menu_mrp_workorder_todo",
    "mrp.menu_mrp_bom_form_action",
    "mrp.menu_mrp_product_form",
    "mrp.menu_view_resource_search_mrp",
    "mrp.menu_mrp_work_order_report",
    "mrp.menu_mrp_workcenter_productivity_report",
    "mrp.menu_mrp_config",
    "mrp.menu_mrp_routing_action",
]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("mrp_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "mrp_modern.menu_dashboard": "fa-th-large",
    "mrp_modern.menu_operations": "fa-industry",
    "mrp_modern.menu_products": "fa-cube",
    "mrp_modern.menu_reporting": "fa-bar-chart",
    "mrp_modern.menu_config": "fa-cog",
    "mrp_modern.menu_todo": "fa-list",
    "mrp_modern.menu_mos": "fa-industry",
    "mrp_modern.menu_done": "fa-check-circle",
    "mrp_modern.menu_unbuild": "fa-undo",
    "mrp_modern.menu_workorders": "fa-cogs",
    "mrp_modern.menu_product_list": "fa-cube",
    "mrp_modern.menu_boms": "fa-sitemap",
    "mrp_modern.menu_workcenters": "fa-wrench",
    "mrp_modern.menu_settings": "fa-cog",
    "mrp_modern.menu_operations_setup": "fa-list-ol",
    "mrp_modern.menu_report_workorders": "fa-bar-chart",
    "mrp_modern.menu_report_oee": "fa-line-chart",
    "mrp.menu_mrp_production_action": "fa-industry",
    "mrp.menu_mrp_unbuild": "fa-undo",
    "mrp.menu_mrp_workorder_todo": "fa-cogs",
    "mrp.menu_mrp_bom_form_action": "fa-sitemap",
    "mrp.menu_mrp_product_form": "fa-cube",
    "mrp.menu_view_resource_search_mrp": "fa-wrench",
    "mrp.menu_mrp_scrap": "fa-trash-o",
    "mrp.menu_mrp_traceability": "fa-exchange",
    "mrp.menu_mrp_work_order_report": "fa-bar-chart",
})) {
    menuIcons.add(xmlid, icon);
}

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "mr",
    ownPrefixes: ["mrp_modern."],
    mergeInto: MERGE_INTO,
    replaced: REPLACED,
    secondary: SECONDARY,
    icons: menuIcons,
});
