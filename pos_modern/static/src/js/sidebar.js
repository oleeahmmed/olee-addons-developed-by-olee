import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { CategoryDrawer, CustomerDrawer, ProductDrawer, ShopDrawer } from "./drawer";

/**
 * Modern POS in the theme's sidebar (same arrangement as Modern CRM).
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says how
 * to arrange the Point of Sale back office:
 *   sidebar  = Menu (sell), Tables (restaurants), Orders — as simple as the shadcn POS app
 *   top bar  = More (dashboard, shops, sessions, products, customers, payments, refunds,
 *              ongoing orders, Odoo's catalog entries), Reporting and Configuration
 * Odoo's own entries for the same pages are hidden: ours show the same records with the
 * same views, filters and forms.
 */
const APP_XMLID = "point_of_sale.menu_point_root";
const SECONDARY = new Set([
    "pos_modern.menu_more",
    "point_of_sale.menu_point_rep",
    "point_of_sale.menu_point_config_product",
]);
const REPLACED = new Set([
    "point_of_sale.menu_pos_dashboard",
    "point_of_sale.menu_point_ofsale",
    "point_of_sale.menu_pos_session_all",
    "point_of_sale.menu_pos_payment",
    "point_of_sale.menu_point_of_sale_customer",
    "point_of_sale.menu_pos_products",
    "point_of_sale.menu_products_pos_category",
]);
// Odoo's own groups whose remaining entries join our "More" group
const MERGE_INTO = {
    "point_of_sale.menu_point_of_sale": "pos_modern.menu_more",
    "point_of_sale.pos_config_menu_catalog": "pos_modern.menu_more",
};
const ORDER = ["pos_modern.menu_menu", "pos_modern.menu_tables", "pos_modern.menu_orders"];

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). */
export const menuIcons = registry.category("pos_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "pos_modern.menu_menu": "fa-th-large",
    "pos_modern.menu_tables": "fa-th",
    "pos_modern.menu_dashboard": "fa-bar-chart",
    "pos_modern.menu_shops": "fa-shopping-basket",
    "pos_modern.menu_orders": "fa-shopping-cart",
    "pos_modern.menu_sessions": "fa-clock-o",
    "pos_modern.menu_products": "fa-cube",
    "pos_modern.menu_customers": "fa-address-book-o",
    "pos_modern.menu_more": "fa-ellipsis-h",
    "pos_modern.menu_payments": "fa-credit-card",
    "pos_modern.menu_refunds": "fa-undo",
    "pos_modern.menu_ongoing": "fa-hourglass-half",
    "pos_modern.menu_categories": "fa-th-large",
    // Odoo's own Point of Sale menus
    "point_of_sale.menu_pos_preparation_printer": "fa-print",
    "point_of_sale.menu_point_rep": "fa-bar-chart",
    "point_of_sale.menu_report_pos_order_all": "fa-bar-chart",
    "point_of_sale.menu_report_order_details": "fa-file-text-o",
    "point_of_sale.menu_report_daily_details": "fa-calendar-check-o",
    "point_of_sale.menu_point_config_product": "fa-cog",
    "point_of_sale.menu_pos_global_settings": "fa-sliders",
    "point_of_sale.menu_pos_preset": "fa-bookmark-o",
    "point_of_sale.menu_pos_payment_method": "fa-credit-card",
    "point_of_sale.menu_pos_bill": "fa-money",
    "point_of_sale.menu_point_of_sale_list": "fa-shopping-basket",
    "point_of_sale.menu_pos_note_model": "fa-sticky-note-o",
    "point_of_sale.pos_menu_products_configuration": "fa-cubes",
    "point_of_sale.menu_action_tax_form_open": "fa-percent",
    "point_of_sale.pos_menu_products_attribute_action": "fa-sliders",
    "point_of_sale.pos_menu_products_tag_action": "fa-tags",
    "point_of_sale.pos_config_menu_action_product_product": "fa-cubes",
    "point_of_sale.menu_product_combo": "fa-object-group",
    "point_of_sale.pos_config_menu_action_product_pricelist": "fa-list-alt",
})) {
    menuIcons.add(xmlid, icon);
}

/** What the sidebar's "+" creates on each page. */
export const createTargets = registry.category("pos_modern.create_targets");
for (const [xmlid, spec] of Object.entries({
    "pos_modern.menu_menu": { resModel: "product.template", label: _t("New product") },
    "pos_modern.menu_dashboard": { resModel: "product.template", label: _t("New product") },
    "pos_modern.menu_shops": { resModel: "pos.config", label: _t("New shop") },
    "pos_modern.menu_products": { resModel: "product.template", label: _t("New product") },
    "pos_modern.menu_customers": { resModel: "res.partner", label: _t("New customer") },
    "pos_modern.menu_categories": { resModel: "pos.category", label: _t("New category") },
})) {
    createTargets.add(xmlid, spec);
}
const DRAWERS = {
    "product.template": ProductDrawer,
    "res.partner": CustomerDrawer,
    "pos.config": ShopDrawer,
    "pos.category": CategoryDrawer,
};

async function onCreate(spec, env) {
    const Drawer = DRAWERS[spec.resModel];
    if (!Drawer) {
        return false;
    }
    env.services.dialog.add(Drawer, {
        context: spec.context || {},
        onSaved: () => env.bus.trigger("pos_modern:reload"),
    });
    return true;
}

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "ps",
    ownPrefixes: ["pos_modern."],
    mergeInto: MERGE_INTO,
    replaced: REPLACED,
    secondary: SECONDARY,
    order: ORDER,
    icons: menuIcons,
    createTargets,
    defaultCreate: "pos_modern.menu_products",
    noCreate: new Set(["pos.order", "pos.session", "pos.payment"]),
    onCreate,
});

// Counters next to menus (refreshed when the app opens, at most once a minute)
const badges = registry.category("modern_theme.menu_badges");
// registers open right now
badges.add("pos_modern.menu_sessions", (env) =>
    env.services.orm.searchCount("pos.session", [["state", "!=", "closed"]])
);
badges.add("pos_modern.menu_ongoing", (env) =>
    env.services.orm.searchCount("pos.order", [["state", "=", "draft"]])
);

// Ctrl+K: search orders, shops and products by name (read access checked by the palette)
const palette = registry.category("modern_theme.palette_models");
if (!palette.contains("pos.order")) {
    palette.add("pos.order", { label: _t("PoS order"), icon: "fa-shopping-cart", limit: 4 });
}
if (!palette.contains("pos.config")) {
    palette.add("pos.config", { label: _t("Shop"), icon: "fa-shopping-basket", limit: 3 });
}
