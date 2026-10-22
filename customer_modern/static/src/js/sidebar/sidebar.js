import { registry } from "@web/core/registry";

/**
 * Modern Contacts in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says
 * how to arrange this app: our Directory first, Odoo's Contacts entry hidden (our
 * "All Contacts" page shows the same records with the same views), Configuration at
 * the bottom, closed. Menus of apps that are not installed never appear.
 */
const APP_XMLID = "contacts.menu_contacts";
const MERGE_INTO = {};
// In the top bar (not the sidebar): Reporting, Configuration and less used groups
const SECONDARY = new Set(["contacts.res_partner_menu_config"]);
// Odoo entries already shown by a Modern Contacts page on the same records
const REPLACED = new Set(["contacts.res_partner_menu_contacts"]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("customer_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "customer_modern.menu_dashboard": "fa-th-large",
    "customer_modern.menu_directory": "fa-address-book-o",
    "customer_modern.menu_all": "fa-address-card-o",
    "customer_modern.menu_companies": "fa-building-o",
    "customer_modern.menu_people": "fa-user-o",
    "customer_modern.menu_customers": "fa-handshake-o",
    "customer_modern.menu_vendors": "fa-truck",
    "contacts.res_partner_menu_config": "fa-cog",
    "contacts.menu_partner_category_form": "fa-tags",
    "contacts.res_partner_industry_menu": "fa-industry",
    "contacts.menu_country_partner": "fa-globe",
    "contacts.menu_country_state_partner": "fa-map-o",
    "contacts.menu_country_group": "fa-object-group",
    "contacts.menu_action_res_bank_form": "fa-university",
    "contacts.menu_action_res_partner_bank_form": "fa-credit-card",
})) {
    menuIcons.add(xmlid, icon);
}

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "cu",
    ownPrefixes: ["customer_modern."],
    mergeInto: MERGE_INTO,
    replaced: REPLACED,
    secondary: SECONDARY,
    icons: menuIcons,
});
