import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";

export { openFullForm };

const VIEW_IDS = { model: "account.move.line", method: "modern_accounting_view_ids" };
/** View ids of this app's pages (fetched once per page load). */
export function loadViewIds(orm) {
    return kitLoadViewIds(orm, VIEW_IDS);
}

// Journal items Odoo itself shows in its accounting lists (no section / note lines)
const ITEM_DOMAIN = [["display_type", "not in", ["line_section", "line_subsection", "line_note"]]];
const ITEM_TYPES = ["list", "pivot", "graph"];

/**
 * Pages of Modern Accounting: Odoo's own accounting views (search, filters, group by,
 * pivot, export, view switcher) in the shared modern page of modern_theme. Ledgers and
 * statements are Odoo's journal items with the right filters, grouping and measures,
 * so the date filter, journals, partners and analytic filters all work as in Odoo.
 */
export class ListPage extends KitListPage {
    static cssPrefix = "ac";
    static storagePrefix = "modern_accounting";
    static viewIds = VIEW_IDS;
    static resModel = "account.move.line";
    static types = ITEM_TYPES;
}

/** Journal items: opening one opens its journal entry (that is where it is edited). */
class ItemsPage extends ListPage {
    static allowCreate = false;
    get domain() {
        return ITEM_DOMAIN;
    }
    async open(resId) {
        const [line] = await this.orm.read("account.move.line", [resId], ["move_id"]);
        if (line?.move_id) {
            return openFullForm(this.action, "account.move", line.move_id[0], { viewId: this.state.viewIds.entry_form });
        }
    }
}

/** A statement: Odoo's pivot of journal items, rows and measures preset. */
class StatementPage extends ItemsPage {
    static types = ["pivot", "graph", "list"];
    static rows = ["account_id"];
    static measures = ["debit", "credit", "balance"];
    get context() {
        return {
            search_default_posted: 1,
            pivot_row_groupby: this.constructor.rows,
            pivot_column_groupby: [],
            pivot_measures: this.constructor.measures,
            graph_groupbys: [this.constructor.rows[this.constructor.rows.length - 1]],
            graph_measure: "balance",
        };
    }
}

// ---------------------------------------------------------------- daily work

class JournalEntriesPage extends ListPage {
    static title = _t("Journal Entries");
    static subtitle = _t("Every accounting entry: invoices, bills, payments and your own entries");
    static emptyTitle = _t("Create a journal entry");
    static emptyText = _t("Record an adjustment, an opening balance or any entry that is not an invoice or a payment.");
    static icon = "fa-book";
    static newLabel = _t("New entry");
    static resModel = "account.move";
    static prefix = "entry";
    static types = ["list", "kanban", "activity"];
    get context() {
        return { default_move_type: "entry", view_no_maturity: true };
    }
}

class JournalItemsPage extends ItemsPage {
    static title = _t("Journal Items");
    static subtitle = _t("Every debit and credit line, to filter, group and analyse");
    static icon = "fa-list";
    static prefix = "item";
    get context() {
        return { journal_type: "general", search_default_posted: 1 };
    }
}

class PaymentsPage extends ListPage {
    static title = _t("Payments");
    static subtitle = _t("Money received and paid, by bank or cash");
    static emptyTitle = _t("Register a payment");
    static emptyText = _t("Payments received from customers and paid to vendors, and transfers between your accounts.");
    static icon = "fa-money";
    static newLabel = _t("New payment");
    static resModel = "account.payment";
    static prefix = "payment";
    static types = ["list", "kanban", "graph", "activity"];
    get context() {
        return { default_move_journal_types: ["bank", "cash"], display_account_trust: true };
    }
}

// ---------------------------------------------------------------- ledgers

class AccountsPage extends ListPage {
    static title = _t("Chart of Accounts");
    static subtitle = _t("Your accounts and their current balance");
    static emptyTitle = _t("Add an account");
    static emptyText = _t("Accounts group your journal items: assets, liabilities, equity, income and expenses.");
    static icon = "fa-sitemap";
    static newLabel = _t("New account");
    static resModel = "account.account";
    static prefix = "account";
    static types = ["list", "kanban"];
}

class GeneralLedgerPage extends ItemsPage {
    static title = _t("General Ledger");
    static subtitle = _t("Journal items by account, with debit, credit and balance");
    static icon = "fa-book";
    static prefix = "gl";
    static types = ["list", "pivot", "graph"];
    get context() {
        return { journal_type: "general", search_default_posted: 1, search_default_group_by_account: 1 };
    }
}

class PartnerLedgerPage extends ItemsPage {
    static title = _t("Partner Ledger");
    static subtitle = _t("Open receivable and payable items by customer and vendor");
    static icon = "fa-address-book-o";
    static prefix = "pl";
    static types = ["list", "pivot", "graph"];
    get context() {
        return {
            journal_type: "general",
            search_default_group_by_partner: 1,
            search_default_posted: 1,
            search_default_trade_payable: 1,
            search_default_trade_receivable: 1,
            search_default_unreconciled: 1,
        };
    }
}

class CashBookPage extends ItemsPage {
    static title = _t("Cash & Bank Book");
    static subtitle = _t("Money in and out of each bank and cash account");
    static icon = "fa-university";
    static prefix = "cash";
    static types = ["list", "pivot", "graph"];
    get domain() {
        return [...ITEM_DOMAIN, ["account_id.account_type", "in", ["asset_cash", "liability_credit_card"]]];
    }
    get context() {
        return { journal_type: "bank", search_default_posted: 1, search_default_group_by_account: 1 };
    }
}

class TrialBalancePage extends StatementPage {
    static title = _t("Trial Balance");
    static subtitle = _t("Debit, credit and balance of every account — use the Date filter for a period");
    static icon = "fa-balance-scale";
    static prefix = "tb";
}

// ---------------------------------------------------------------- reporting

class ProfitLossPage extends StatementPage {
    static title = _t("Profit & Loss");
    static subtitle = _t("Income (credit, negative) and expenses by account; the total is the result");
    static icon = "fa-line-chart";
    static prefix = "pnl";
    static measures = ["balance"];
    get domain() {
        return [...ITEM_DOMAIN, ["account_id.internal_group", "in", ["income", "expense"]]];
    }
}

class BalanceSheetPage extends StatementPage {
    static title = _t("Balance Sheet");
    static subtitle = _t("Assets, liabilities and equity by account; this year's result is in Profit & Loss");
    static icon = "fa-columns";
    static prefix = "bs";
    static measures = ["balance"];
    get domain() {
        return [...ITEM_DOMAIN, ["account_id.internal_group", "in", ["asset", "liability", "equity"]]];
    }
}

class TaxReportPage extends StatementPage {
    static title = _t("Tax Report");
    static subtitle = _t("Tax collected and paid, with the base amount, per tax — use the Date filter for a period");
    static icon = "fa-percent";
    static prefix = "tax";
    static rows = ["tax_line_id"];
    static measures = ["tax_base_amount", "balance"];
    get domain() {
        return [...ITEM_DOMAIN, ["tax_line_id", "!=", false]];
    }
}

const actions = registry.category("actions");
actions.add("modern_accounting.entries", JournalEntriesPage);
actions.add("modern_accounting.items", JournalItemsPage);
actions.add("modern_accounting.payments", PaymentsPage);
actions.add("modern_accounting.accounts", AccountsPage);
actions.add("modern_accounting.general_ledger", GeneralLedgerPage);
actions.add("modern_accounting.partner_ledger", PartnerLedgerPage);
actions.add("modern_accounting.cash_book", CashBookPage);
actions.add("modern_accounting.trial_balance", TrialBalancePage);
actions.add("modern_accounting.profit_loss", ProfitLossPage);
actions.add("modern_accounting.balance_sheet", BalanceSheetPage);
actions.add("modern_accounting.tax_report", TaxReportPage);
