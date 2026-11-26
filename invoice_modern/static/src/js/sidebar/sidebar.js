import { registry } from "@web/core/registry";

/**
 * Modern Invoicing in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says
 * how to arrange this app, kept as flat and short as possible:
 * Invoices, Bills, Payments, Contacts, Products and the Accounting group.
 * Credit Notes / Refunds and the less used accounting pages stay in the top bar
 * ("More"); Odoo's duplicate menus are hidden because a Modern Invoicing page or a
 * menu of our own already opens the same records.
 */
const APP_XMLID = "account.menu_finance";
// In the top bar (not the sidebar): Reporting, Configuration and less used groups
const SECONDARY = new Set(["account.menu_finance_reports", "account.menu_finance_configuration"]);
// Odoo entries already shown by a Modern Invoicing page or menu on the same records
const REPLACED = new Set([
    "account.menu_action_move_out_invoice_type",
    "account.menu_action_move_out_refund_type",
    "account.menu_action_account_payments_receivable",
    "account.menu_action_move_in_invoice_type",
    "account.menu_action_move_in_refund_type",
    "account.menu_action_account_payments_payable",
    // Odoo's journal dashboard (accountants only): no dashboards in this app
    "account.menu_board_journal_1",
    // Odoo's partner / product lists: reopened from Contacts and Products below
    "account.menu_account_customer",
    "account.menu_account_supplier",
    "account.product_product_menu_sellable",
    "account.product_product_menu_purchasable",
    // Odoo's Transactions container: Journal Entries has its own modern menu
    "account.account_transactions_menu",
    // Odoo's Review group repeats Journal Items and Audit Trail: already in "More"
    "account.account_audit_menu",
]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("invoice_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "invoice_modern.menu_invoices": "fa-file-text-o",
    "invoice_modern.menu_bills": "fa-file-text",
    "invoice_modern.menu_credit_notes": "fa-reply",
    "invoice_modern.menu_refunds": "fa-undo",
    "invoice_modern.menu_payments": "fa-exchange",
    "invoice_modern.menu_payments_in": "fa-money",
    "invoice_modern.menu_payments_out": "fa-credit-card",
    "invoice_modern.menu_contacts": "fa-address-book-o",
    "invoice_modern.menu_contacts_customers": "fa-address-book-o",
    "invoice_modern.menu_contacts_vendors": "fa-truck",
    "invoice_modern.menu_products": "fa-cube",
    "invoice_modern.menu_products_sale": "fa-cube",
    "invoice_modern.menu_products_purchase": "fa-cubes",
    "account.menu_finance_entries": "fa-calculator",
    "invoice_modern.menu_acct_entries": "fa-book",
    "invoice_modern.menu_acct_general_ledger": "fa-book",
    "invoice_modern.menu_acct_trial_balance": "fa-balance-scale",
    "invoice_modern.menu_acct_profit_loss": "fa-line-chart",
    "invoice_modern.menu_acct_balance_sheet": "fa-columns",
    "invoice_modern.menu_acct_tax_report": "fa-percent",
    "invoice_modern.menu_acct_items": "fa-list",
    "invoice_modern.menu_acct_payments": "fa-money",
    "invoice_modern.menu_acct_journals": "fa-th",
    "invoice_modern.menu_acct_analytic_items": "fa-pie-chart",
    "invoice_modern.menu_acct_accounts": "fa-sitemap",
    "invoice_modern.menu_acct_partner_ledger": "fa-address-book-o",
    "invoice_modern.menu_acct_cash_book": "fa-university",
    "invoice_modern.menu_acct_invoice_analysis": "fa-file-text-o",
    "invoice_modern.menu_acct_analytic_report": "fa-pie-chart",
    "invoice_modern.menu_acct_audit_trail": "fa-history",
})) {
    menuIcons.add(xmlid, icon);
}

// Less used pages: in the top bar ("More"), so the sidebar keeps the everyday ones.
const TOPBAR = new Set([
    "invoice_modern.menu_credit_notes",
    "invoice_modern.menu_refunds",
    "invoice_modern.menu_acct_items",
    "invoice_modern.menu_acct_payments",
    "invoice_modern.menu_acct_journals",
    "invoice_modern.menu_acct_analytic_items",
    "invoice_modern.menu_acct_accounts",
    "invoice_modern.menu_acct_partner_ledger",
    "invoice_modern.menu_acct_cash_book",
    "invoice_modern.menu_acct_invoice_analysis",
    "invoice_modern.menu_acct_analytic_report",
    "invoice_modern.menu_acct_audit_trail",
]);

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "iv",
    topbar: TOPBAR,
    // Odoo's Accounting group now holds the pages moved over from Modern Accounting
    ownPrefixes: ["invoice_modern.", "account.menu_finance_entries"],
    replaced: REPLACED,
    secondary: SECONDARY,
    icons: menuIcons,
});
