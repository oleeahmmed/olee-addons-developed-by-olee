import { registry } from "@web/core/registry";

/**
 * Purchase in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says
 * how to arrange this app: our groups first, Odoo's leftover entries merged into
 * them, entries we already show with a modern page hidden, and Reporting /
 * Configuration kept at the bottom, closed. Menus of apps that are not installed
 * do not exist in the database, so they can never appear.
 */
const APP_XMLID = "purchase.menu_purchase_root";
// Odoo's other Purchase menus (Product Variants…) go to the top bar ("More").
const MERGE_INTO = {};
// In the top bar (not the sidebar): Reporting, Configuration and less used groups
const SECONDARY = new Set(["purchase.purchase_report_main", "purchase.menu_purchase_config"]);
// Odoo entries already shown by a Modern Purchase page / menu on the same records
const REPLACED = new Set([
    "purchase.menu_purchase_rfq",
    "purchase.menu_purchase_form_action",
    "purchase.menu_procurement_management_supplier_name",
    "purchase.menu_procurement_partner_contact_form",
    "purchase.menu_product_pricelist_action2_purchase",
]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("purchase_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "purchase_modern.menu_dashboard": "fa-th-large",
    "purchase_modern.menu_buy": "fa-shopping-bag",
    "purchase_modern.menu_catalog": "fa-cube",
    "purchase_modern.menu_rfqs": "fa-file-text-o",
    "purchase_modern.menu_orders": "fa-shopping-cart",
    "purchase_modern.menu_to_bill": "fa-file-text",
    "purchase_modern.menu_vendors": "fa-address-book-o",
    "purchase_modern.menu_products": "fa-cube",
    "purchase_modern.menu_settings": "fa-cog",
    // Odoo's own Purchase menus
    "purchase.menu_purchase_rfq": "fa-file-text-o",
    "purchase.menu_purchase_form_action": "fa-shopping-cart",
    "purchase.menu_procurement_management_supplier_name": "fa-address-book-o",
    "purchase.menu_procurement_partner_contact_form": "fa-cube",
    "purchase.product_product_menu": "fa-cubes",
    "purchase.menu_product_pricelist_action2_purchase": "fa-tags",
    "purchase.menu_product_attribute_action": "fa-sliders",
    "purchase.menu_product_category_config_purchase": "fa-sitemap",
    "purchase.menu_purchase_uom_form_action": "fa-balance-scale",
    "purchase.purchase_report": "fa-bar-chart",
})) {
    menuIcons.add(xmlid, icon);
}

// Less used pages: in the top bar ("More"), so the sidebar keeps the everyday ones.
const TOPBAR = new Set([
    "purchase_modern.menu_to_bill",
    "purchase_modern.menu_pricelists",
]);

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "mp",
    topbar: TOPBAR,
    ownPrefixes: ["purchase_modern."],
    mergeInto: MERGE_INTO,
    replaced: REPLACED,
    secondary: SECONDARY,
    icons: menuIcons,
});
