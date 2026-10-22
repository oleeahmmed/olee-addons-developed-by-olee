import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";

export { openFullForm };

const VIEW_IDS = { model: "account.move", method: "invoice_modern_view_ids" };
/** View ids of this app's pages (fetched once per page load). */
export function loadViewIds(orm) {
    return kitLoadViewIds(orm, VIEW_IDS);
}

/**
 * Pages of Modern Invoicing: Odoo's own invoice / payment views (search, filters,
 * group by, pager, export, view switcher) in the shared modern page of modern_theme.
 * Domains and contexts are exactly those of Odoo's own Invoicing menus, so default
 * filters, numbering and journals behave the same.
 */
export class ListPage extends KitListPage {
    static cssPrefix = "iv";
    static storagePrefix = "invoice_modern";
    static viewIds = VIEW_IDS;
    static resModel = "account.move";
    static types = ["list", "kanban", "activity"];
}

class InvoicesPage extends ListPage {
    static title = _t("Invoices");
    static emptyTitle = _t("Create a customer invoice");
    static emptyText = _t("Create invoices, register payments and keep track of the discussions with your customers.");
    static icon = "fa-file-text-o";
    static newLabel = _t("New invoice");
    static prefix = "invoice";
    get domain() {
        return [["move_type", "in", ["out_invoice", "out_refund", "out_receipt"]]];
    }
    get context() {
        return { search_default_out_invoice: 1, search_default_out_receipt: 1, default_move_type: "out_invoice" };
    }
}

class CreditNotesPage extends ListPage {
    static title = _t("Credit Notes");
    static emptyTitle = _t("Create a credit note");
    static emptyText = _t("A credit note gives money back to a customer, fully or partly cancelling an invoice.");
    static icon = "fa-reply";
    static newLabel = _t("New credit note");
    static prefix = "credit";
    get domain() {
        return [["move_type", "in", ["out_invoice", "out_refund"]]];
    }
    get context() {
        return { search_default_out_refund: 1, default_move_type: "out_refund", display_account_trust: true };
    }
}

class BillsPage extends ListPage {
    static title = _t("Bills");
    static emptyTitle = _t("Create a vendor bill");
    static emptyText = _t("Record what you owe your vendors, then pay them in a click.");
    static icon = "fa-file-text";
    static newLabel = _t("New bill");
    static prefix = "bill";
    get domain() {
        return [["move_type", "in", ["in_invoice", "in_refund", "in_receipt"]]];
    }
    get context() {
        return { search_default_in_invoice: 1, search_default_in_receipt: 1, default_move_type: "in_invoice", display_account_trust: true };
    }
}

class RefundsPage extends ListPage {
    static title = _t("Refunds");
    static emptyTitle = _t("Create a vendor refund");
    static emptyText = _t("A refund is money a vendor gives back to you, fully or partly cancelling a bill.");
    static icon = "fa-undo";
    static newLabel = _t("New refund");
    static prefix = "refund";
    get domain() {
        return [["move_type", "in", ["in_invoice", "in_refund"]]];
    }
    get context() {
        return { search_default_in_refund: 1, default_move_type: "in_refund" };
    }
}

class PaymentsReceivedPage extends ListPage {
    static title = _t("Payments Received");
    static emptyTitle = _t("Register a payment");
    static emptyText = _t("Money received from customers, by bank or cash.");
    static icon = "fa-money";
    static newLabel = _t("New payment");
    static resModel = "account.payment";
    static prefix = "payin";
    static types = ["list", "kanban", "graph", "activity"];
    get context() {
        return {
            default_payment_type: "inbound",
            default_partner_type: "customer",
            search_default_inbound_filter: 1,
            default_move_journal_types: ["bank", "cash"],
            display_account_trust: true,
        };
    }
}

class PaymentsMadePage extends ListPage {
    static title = _t("Payments Made");
    static emptyTitle = _t("Register a payment");
    static emptyText = _t("Money paid to vendors, by bank or cash.");
    static icon = "fa-credit-card";
    static newLabel = _t("New payment");
    static resModel = "account.payment";
    static prefix = "payout";
    static types = ["list", "kanban", "graph", "activity"];
    get context() {
        return {
            default_payment_type: "outbound",
            default_partner_type: "supplier",
            search_default_outbound_filter: 1,
            default_move_journal_types: ["bank", "cash"],
            display_account_trust: true,
        };
    }
}

const actions = registry.category("actions");
actions.add("invoice_modern.invoices", InvoicesPage);
actions.add("invoice_modern.credit_notes", CreditNotesPage);
actions.add("invoice_modern.bills", BillsPage);
actions.add("invoice_modern.refunds", RefundsPage);
actions.add("invoice_modern.payments_in", PaymentsReceivedPage);
actions.add("invoice_modern.payments_out", PaymentsMadePage);
