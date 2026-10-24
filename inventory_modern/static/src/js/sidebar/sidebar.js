import { registry } from "@web/core/registry";

/**
 * Inventory in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says
 * how to arrange this app: our groups first, Odoo's leftover entries merged into
 * them, entries we already show with a modern page hidden, and Reporting /
 * Configuration kept at the bottom, closed. Menus of apps that are not installed
 * do not exist in the database, so they can never appear.
 */
const APP_XMLID = "stock.menu_stock_root";
// Odoo's other Inventory menus (Overview, Transfers, Scrap, Lots…) go to the top bar
// ("More"); Replenishment, used every day, joins our Operations group.
const MERGE_INTO = {};
const PROMOTE = {
    "stock.menu_reordering_rules_replenish": "inventory_modern.menu_operations", // Replenishment
};
// In the top bar (not the sidebar): Reporting, Configuration and less used groups
const SECONDARY = new Set(["stock.menu_warehouse_report", "stock.menu_stock_config_settings"]);
// Odoo entries already shown by an Inventory Modern page on the same records
const REPLACED = new Set([
    "stock.in_picking",
    "stock.out_picking",
    "stock.int_picking",
    "stock.menu_product_variant_config_stock",
]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("inventory_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "inventory_modern.menu_dashboard": "fa-th-large",
    "inventory_modern.menu_operations": "fa-exchange",
    "inventory_modern.menu_products": "fa-cubes",
    "inventory_modern.menu_receipts": "fa-download",
    "inventory_modern.menu_deliveries": "fa-truck",
    "inventory_modern.menu_internal": "fa-exchange",
    "inventory_modern.menu_product_list": "fa-cube",
    "inventory_modern.menu_stock": "fa-cubes",
    "inventory_modern.menu_moves": "fa-history",
    // Odoo's own Inventory menus
    "stock.stock_picking_type_menu": "fa-th",
    "stock.in_picking": "fa-download",
    "stock.out_picking": "fa-truck",
    "stock.int_picking": "fa-exchange",
    "stock.menu_action_inventory_tree": "fa-check-square-o",
    "stock.menu_stock_scrap": "fa-trash-o",
    "stock.menu_reordering_rules_replenish": "fa-refresh",
    "stock.menu_stock_references": "fa-link",
    "stock.menu_procurement_compute": "fa-play-circle-o",
    "stock.menu_product_variant_config_stock": "fa-cube",
    "stock.product_product_menu": "fa-clone",
    "stock.menu_action_production_lot_form": "fa-barcode",
    "stock.menu_package": "fa-archive",
    "stock.menu_product_stock": "fa-cubes",
    "stock.menu_valuation": "fa-map-marker",
    "stock.stock_move_line_menu": "fa-history",
    "stock.stock_move_menu": "fa-line-chart",
    "stock.menu_stock_general_settings": "fa-cog",
    "stock.menu_action_warehouse_form": "fa-building-o",
    "stock.menu_pickingtype": "fa-th-list",
    "stock.menu_action_location_form": "fa-map-marker",
    "stock.menu_routes_config": "fa-random",
    "stock.menu_action_rules_form": "fa-code-fork",
    "stock.menu_storage_categoty_config": "fa-th-large",
    "stock.menu_putaway": "fa-sign-in",
    "stock.menu_product_category_config_stock": "fa-sitemap",
    "stock.menu_attribute_action": "fa-sliders",
    "stock.menu_stock_uom_form_action": "fa-balance-scale",
    "stock.menu_wms_barcode_nomenclature_all": "fa-barcode",
    "stock.menu_packaging_types": "fa-archive",
})) {
    menuIcons.add(xmlid, icon);
}

// Less used pages: in the top bar ("More"), so the sidebar keeps the everyday ones.
const TOPBAR = new Set([
    "inventory_modern.menu_moves",
]);

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "im",
    topbar: TOPBAR,
    ownPrefixes: ["inventory_modern."],
    mergeInto: MERGE_INTO,
    promote: PROMOTE,
    replaced: REPLACED,
    secondary: SECONDARY,
    icons: menuIcons,
});
