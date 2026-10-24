import { registry } from "@web/core/registry";

/**
 * Modern Invoicing in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says
 * how to arrange this app: our Customers / Vendors groups first with Odoo's leftover
 * entries (products, partner lists) merged into them, entries we already show with a
 * modern page hidden, and Reporting / Configuration / accountant menus at the bottom.
 */
const APP_XMLID = "account.menu_finance";
const MERGE_INTO = {
    // Odoo's journal dashboard (accountants only) goes with the reports
    "account.menu_board_journal_1": "account.menu_finance_reports",
};
// In the top bar (not the sidebar): Reporting, Configuration and less used groups
const SECONDARY = new Set(["account.menu_finance_reports", "account.menu_finance_configuration"]);
// Odoo entries already shown by a Modern Invoicing page on the same records
const REPLACED = new Set([
    "account.menu_action_move_out_invoice_type",
    "account.menu_action_move_out_refund_type",
    "account.menu_action_account_payments_receivable",
    "account.menu_action_move_in_invoice_type",
    "account.menu_action_move_in_refund_type",
    "account.menu_action_account_payments_payable",
]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("invoice_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "invoice_modern.menu_dashboard": "fa-th-large",
    "invoice_modern.menu_customers": "fa-arrow-circle-down",
    "invoice_modern.menu_invoices": "fa-file-text-o",
    "invoice_modern.menu_credit_notes": "fa-reply",
    "invoice_modern.menu_payments_in": "fa-money",
    "invoice_modern.menu_vendors": "fa-arrow-circle-up",
    "invoice_modern.menu_bills": "fa-file-text",
    "invoice_modern.menu_refunds": "fa-undo",
    "invoice_modern.menu_payments_out": "fa-credit-card",
    "account.product_product_menu_sellable": "fa-cube",
    "account.product_product_menu_purchasable": "fa-cubes",
    "account.menu_account_customer": "fa-address-book-o",
    "account.menu_account_supplier": "fa-truck",
    "account.menu_board_journal_1": "fa-th",
    "account.menu_action_account_invoice_report_all": "fa-bar-chart",
    "account.menu_account_config": "fa-cog",
    "account.menu_action_tax_form": "fa-percent",
    "account.menu_action_account_journal_form": "fa-book",
    "account.menu_action_currency_form": "fa-usd",
    "account.menu_action_account_fiscal_position_form": "fa-random",
    "account.menu_action_payment_term_form": "fa-calendar-check-o",
    "account.menu_product_product_categories": "fa-sitemap",
})) {
    menuIcons.add(xmlid, icon);
}

// Less used pages: in the top bar ("More"), so the sidebar keeps the everyday ones.
const TOPBAR = new Set([
    "invoice_modern.menu_credit_notes",
    "invoice_modern.menu_refunds",
]);

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "iv",
    topbar: TOPBAR,
    ownPrefixes: ["invoice_modern."],
    mergeInto: MERGE_INTO,
    replaced: REPLACED,
    secondary: SECONDARY,
    icons: menuIcons,
});
