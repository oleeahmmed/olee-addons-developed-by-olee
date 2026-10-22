import { registry } from "@web/core/registry";

/**
 * Sales in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says
 * how to arrange this app: our groups first, Odoo's leftover entries merged into
 * them, entries we already show with a modern page hidden, and Reporting /
 * Configuration kept at the bottom, closed. Menus of apps that are not installed
 * do not exist in the database, so they can never appear.
 */
const APP_XMLID = "sale.sale_menu_root";
// Odoo's other Sales menus (Orders to Upsell, Product Variants…) stay in their own
// groups: the top bar shows them under "More", the sidebar keeps the everyday pages.
const MERGE_INTO = {};
// In the top bar (not the sidebar): Reporting, Configuration and less used groups
const SECONDARY = new Set(["sales_modern.menu_team", "sale.menu_sale_report", "sale.menu_sale_config"]);
// Odoo entries already shown by a Sales Modern page on the same records
const REPLACED = new Set([
    "sale.menu_sale_quotations",
    "sale.menu_sale_order",
    "sale.res_partner_menu",
    "sale.menu_sale_order_invoice",
    "sale.menu_product_template_action",
    "sale.menu_product_pricelist_main",
    "sale.report_sales_team",
    "sale.sales_team_config",
]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("sales_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "sales_modern.menu_dashboard": "fa-th-large",
    "sales_modern.menu_sell": "fa-shopping-cart",
    "sales_modern.menu_catalog": "fa-cube",
    "sales_modern.menu_team": "fa-users",
    "sales_modern.menu_quotations": "fa-file-text-o",
    "sales_modern.menu_orders": "fa-shopping-cart",
    "sales_modern.menu_to_invoice": "fa-file-text",
    "sales_modern.menu_customers": "fa-address-book-o",
    "sales_modern.menu_products": "fa-cube",
    "sales_modern.menu_salespeople": "fa-user",
    "sales_modern.menu_pricelists": "fa-tags",
    "sales_modern.menu_teams": "fa-users",
    "sales_modern.menu_settings": "fa-cog",
    "sales_modern.menu_categories": "fa-sitemap",
    "sales_modern.menu_order_tags": "fa-tag",
    // Odoo's own Sales menus
    "sale.menu_sale_quotations": "fa-file-text-o",
    "sale.menu_sale_order": "fa-shopping-cart",
    "sale.report_sales_team": "fa-users",
    "sale.res_partner_menu": "fa-address-book-o",
    "sale.menu_sale_order_invoice": "fa-file-text",
    "sale.menu_sale_order_upselling": "fa-level-up",
    "sale.menu_product_template_action": "fa-cube",
    "sale.menu_products": "fa-cubes",
    "sale.menu_product_pricelist_main": "fa-tags",
    "sale.menu_reporting_sales": "fa-bar-chart",
    "sale.menu_reporting_salespeople": "fa-user",
    "sale.menu_reporting_product": "fa-cube",
    "sale.menu_reporting_customer": "fa-address-book-o",
    "sale.menu_sale_general_settings": "fa-cog",
    "sale.sales_team_config": "fa-users",
    "sale.menu_tag_config": "fa-tag",
    "sale.menu_product_attribute_action": "fa-sliders",
    "sale.menu_product_combos": "fa-th-list",
    "sale.menu_product_categories": "fa-sitemap",
    "sale.menu_product_tags": "fa-tags",
    "sale.menu_product_uom_form_action": "fa-balance-scale",
    "sale.payment_provider_menu": "fa-credit-card",
    "sale.payment_method_menu": "fa-money",
    "sale.sale_menu_config_activity_type": "fa-th",
    "sale.sale_menu_config_activity_plan": "fa-tasks",
    "sale_management.sale_order_template_menu": "fa-clone",
    "sale_pdf_quote_builder.sale_menu_quotation_document_action": "fa-file-pdf-o",
    "sale.payment_token_menu": "fa-key",
    "sale.payment_transaction_menu": "fa-exchange",
})) {
    menuIcons.add(xmlid, icon);
}

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "ss",
    ownPrefixes: ["sales_modern."],
    mergeInto: MERGE_INTO,
    replaced: REPLACED,
    secondary: SECONDARY,
    icons: menuIcons,
});
