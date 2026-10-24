import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, periodCaption, loadDashboard } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDate } from "@modern_theme/js/app_kit/utils";
import { openFullForm } from "./list_pages";

const STORE_KEY = "modern_accounting.dashboard";
const ITEM_DOMAIN = [["display_type", "not in", ["line_section", "line_subsection", "line_note"]], ["parent_state", "=", "posted"]];

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * The accountant's dashboard: result of the period, cash and bank, receivables and
 * payables, and what needs checking. One server call
 * (account.move.line.modern_accounting_dashboard), read with the user's own rights.
 * Every figure opens Odoo's own journal items or entries behind it.
 */
export class AccountingDashboard extends Component {
    static template = "modern_accounting.Dashboard";
    static components = { ...OD_COMPONENTS };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        const saved = remembered();
        this.state = useState({
            loading: true,
            busy: false,
            error: false,
            data: null,
            canCreate: false,
            period: saved.period || "month",
        });
        this.firstName = (user.name || "").split(" ")[0];
        this.greeting = greeting();
        this.m = (v) => this.fmt.full(v);
        this.ms = (v) => this.fmt.short(v);
        this.axis = (v) => this.fmt.axis(v);
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("account.move", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        const data = await loadDashboard(this, () =>
            this.orm.call("account.move.line", "modern_accounting_dashboard", [this.state.period])
        );
        if (!data) {
            return;
        }
        this.fmt = moneyFormatters(data.currency_id, data.lakh);
        this.state.data = data;
    }

    onFilters(change) {
        Object.assign(this.state, change);
        try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify({ period: this.state.period }));
        } catch {
            // private mode: the choice is simply not remembered
        }
        return this.load();
    }

    // ---------- figures ----------
    shortDate(v) {
        return shortDate(v);
    }
    get caption() {
        return periodCaption(this.state.data.range, this.state.data.period);
    }
    get compare() {
        return compareWord(this.state.data.period);
    }
    get k() {
        return this.state.data.kpis;
    }
    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get ytdExpense() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.expense, 0);
    }
    get profitHint() {
        const k = this.k;
        if (k.margin !== null && k.margin !== undefined) {
            return _t("%s%% of income", k.margin);
        }
        return k.profit_prev ? _t("Previous period %s", this.ms(k.profit_prev)) : _t("income minus expenses");
    }
    get liquidityTotal() {
        return this.state.data.liquidity.reduce((s, j) => s + j.value, 0);
    }
    get expenseTotal() {
        return this.state.data.expenses.reduce((s, e) => s + e.value, 0);
    }
    journalIcon(type) {
        return { bank: "fa-university", cash: "fa-money", credit: "fa-credit-card" }[type] || "fa-book";
    }
    entryLabel(o) {
        return (
            {
                out_invoice: _t("Invoice"),
                out_refund: _t("Credit note"),
                in_invoice: _t("Bill"),
                in_refund: _t("Refund"),
                out_receipt: _t("Receipt"),
                in_receipt: _t("Receipt"),
            }[o.move_type] || _t("Entry")
        );
    }
    get statements() {
        return [
            { key: "trial_balance", label: _t("Trial Balance"), sub: _t("Debit, credit, balance"), icon: "fa-balance-scale", tone: "blue" },
            { key: "profit_loss", label: _t("Profit & Loss"), sub: _t("Income and expenses"), icon: "fa-line-chart", tone: "green" },
            { key: "balance_sheet", label: _t("Balance Sheet"), sub: _t("Assets and liabilities"), icon: "fa-columns", tone: "violet" },
            { key: "general_ledger", label: _t("General Ledger"), sub: _t("By account"), icon: "fa-book", tone: "teal" },
            { key: "partner_ledger", label: _t("Partner Ledger"), sub: _t("Customers and vendors"), icon: "fa-address-book-o", tone: "amber" },
            { key: "tax_report", label: _t("Tax Report"), sub: _t("VAT collected and paid"), icon: "fa-percent", tone: "rose" },
        ];
    }

    // ---------- navigation: Odoo's own lists and forms ----------
    go(key) {
        return this.action.doAction(`modern_accounting.action_${key}`);
    }
    openLines(name, domain, context = {}) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "account.move.line",
            views: [[false, "list"], [false, "pivot"], [false, "graph"]],
            domain: [...ITEM_DOMAIN, ...domain],
            context: { journal_type: "general", ...context },
            target: "current",
        });
    }
    openMoves(name, domain) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "account.move",
            views: [[false, "list"], [false, "form"]],
            domain,
            context: { default_move_type: "entry" },
            target: "current",
        });
    }
    get periodDomain() {
        const [start] = this.state.data.range;
        return [["date", ">=", start], ["date", "<=", this.state.data.end]];
    }
    openIncome() {
        return this.openLines(_t("Income"), [["account_id.internal_group", "=", "income"], ...this.periodDomain], { search_default_group_by_account: 1 });
    }
    openExpense() {
        return this.openLines(_t("Expenses"), [["account_id.internal_group", "=", "expense"], ...this.periodDomain], { search_default_group_by_account: 1 });
    }
    openProfit() {
        return this.go("profit_loss");
    }
    openCash() {
        return this.go("cash_book");
    }
    openAccountType(name, type) {
        return this.openLines(name, [["account_id.account_type", "=", type], ["date", "<=", this.state.data.today]], {
            search_default_group_by_partner: 1,
            search_default_unreconciled: 1,
        });
    }
    openJournal(j) {
        return this.openLines(j.label, [["account_id", "=", j.account_id], ["date", "<=", this.state.data.today]]);
    }
    openExpenseAccount(item) {
        if (!item.id) {
            return this.openExpense();
        }
        return this.openLines(item.label, [["account_id", "=", item.id], ...this.periodDomain]);
    }
    // ---------- shadcn block: the latest entries table ----------
    get entryColumns() {
        return [
            { key: "number", label: _t("Entry"), type: "person" },
            { key: "date", label: _t("Date"), type: "muted" },
            { key: "partner", label: _t("Partner") },
            { key: "ref", label: _t("Reference"), type: "muted" },
            { key: "kind", label: _t("Type"), type: "badge" },
            { key: "amount", label: _t("Amount"), type: "num", align: "end" },
        ];
    }
    get entryRows() {
        return this.state.data.recent.map((o) => ({
            id: o.id,
            number: o.name,
            number_sub: o.journal_id ? o.journal_id[1] : "",
            date: shortDate(o.date),
            partner: o.partner_id ? o.partner_id[1] : "",
            ref: o.ref || "",
            kind: this.entryLabel(o), kind_tone: "slate",
            amount: this.m(o.amount_total_signed),
        }));
    }
    openMove(o) {
        return openFullForm(this.action, "account.move", o.id);
    }
    newEntry() {
        return openFullForm(this.action, "account.move", false, { context: { default_move_type: "entry" } });
    }
    openAttention(item) {
        const today = this.state.data.today;
        const overdue = [["reconciled", "=", false], ["amount_residual", "!=", 0], ["date_maturity", "<", today]];
        switch (item.key) {
            case "draft":
                return this.openMoves(item.label, [["state", "=", "draft"]]);
            case "to_check":
                return this.openMoves(item.label, [["state", "=", "posted"], ["checked", "=", false]]);
            case "unmatched":
                return this.action.doAction({
                    type: "ir.actions.act_window",
                    name: item.label,
                    res_model: "account.bank.statement.line",
                    views: [[false, "list"], [false, "form"]],
                    domain: [["is_reconciled", "=", false]],
                    target: "current",
                });
            case "overdue_in":
                return this.openLines(item.label, [["account_id.account_type", "=", "asset_receivable"], ...overdue], { search_default_group_by_partner: 1 });
            case "overdue_out":
                return this.openLines(item.label, [["account_id.account_type", "=", "liability_payable"], ...overdue], { search_default_group_by_partner: 1 });
        }
    }
}

registry.category("actions").add("modern_accounting.dashboard", AccountingDashboard);
