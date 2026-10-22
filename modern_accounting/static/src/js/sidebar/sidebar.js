import { registry } from "@web/core/registry";

/**
 * Modern Accounting in the theme's sidebar.
 *
 * Modern Theme draws the sidebar from Odoo's own menus (groups and installed modules
 * decide what is shown). This file only says how to arrange this app: Dashboard,
 * Daily Work and Ledgers in the sidebar; Reporting and Configuration in the top bar.
 */
const APP_XMLID = "modern_accounting.menu_root";

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("modern_accounting.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "modern_accounting.menu_dashboard": "fa-th-large",
    "modern_accounting.menu_daily": "fa-pencil-square-o",
    "modern_accounting.menu_entries": "fa-book",
    "modern_accounting.menu_items": "fa-list",
    "modern_accounting.menu_payments": "fa-money",
    "modern_accounting.menu_journals": "fa-th",
    "modern_accounting.menu_analytic_items": "fa-pie-chart",
    "modern_accounting.menu_ledgers": "fa-columns",
    "modern_accounting.menu_accounts": "fa-sitemap",
    "modern_accounting.menu_general_ledger": "fa-book",
    "modern_accounting.menu_partner_ledger": "fa-address-book-o",
    "modern_accounting.menu_cash_book": "fa-university",
    "modern_accounting.menu_trial_balance": "fa-balance-scale",
    "modern_accounting.menu_reporting": "fa-bar-chart",
    "modern_accounting.menu_profit_loss": "fa-line-chart",
    "modern_accounting.menu_balance_sheet": "fa-columns",
    "modern_accounting.menu_tax_report": "fa-percent",
    "modern_accounting.menu_invoice_analysis": "fa-file-text-o",
    "modern_accounting.menu_analytic_report": "fa-pie-chart",
    "modern_accounting.menu_audit_trail": "fa-history",
    "modern_accounting.menu_configuration": "fa-cog",
    "modern_accounting.menu_settings": "fa-sliders",
    "modern_accounting.menu_config_journals": "fa-book",
    "modern_accounting.menu_config_taxes": "fa-percent",
    "modern_accounting.menu_config_fiscal_positions": "fa-random",
    "modern_accounting.menu_config_currencies": "fa-usd",
    "modern_accounting.menu_config_payment_terms": "fa-calendar-check-o",
    "modern_accounting.menu_config_reconcile_models": "fa-magic",
    "modern_accounting.menu_config_journal_groups": "fa-clone",
    "modern_accounting.menu_config_analytic_accounts": "fa-pie-chart",
    "modern_accounting.menu_config_analytic_plans": "fa-sitemap",
    "modern_accounting.menu_config_analytic_models": "fa-share-alt",
    "modern_accounting.menu_config_secure_entries": "fa-lock",
})) {
    menuIcons.add(xmlid, icon);
}

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "ac",
    ownPrefixes: ["modern_accounting."],
    icons: menuIcons,
});

// Odoo's accountant menus of the Invoicing app (Accounting, Review) are all in this app:
// while it is visible, the Invoicing app no longer repeats them.
const moved = registry.category("modern_theme.moved_menus");
for (const xmlid of ["account.menu_finance_entries", "account.account_audit_menu"]) {
    moved.add(xmlid, APP_XMLID);
}
