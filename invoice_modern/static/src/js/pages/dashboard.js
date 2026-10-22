import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, number, periodCaption, loadDashboard } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDate } from "@modern_theme/js/app_kit/utils";
import { openFullForm } from "./list_pages";

const STORE_KEY = "invoice_modern.dashboard";
const OUT = ["out_invoice", "out_refund"];
const IN = ["in_invoice", "in_refund"];
const OPEN = ["not_paid", "partial"];

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Owner dashboard of the Invoicing app: money in and out this period, who owes what
 * and for how long, and what to do today. One server call
 * (account.move.invoice_modern_dashboard), read with the user's own rights.
 */
export class InvoicingDashboard extends Component {
    static template = "invoice_modern.Dashboard";
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
        this.number = number;
        this.m = (v) => this.fmt.full(v);
        this.ms = (v) => this.fmt.short(v);
        // one document's amount in its own currency; credit notes shown as negative
        this.mr = (o, v) => this.fmt.record(o.move_type === "out_refund" ? -v : v, o.currency_id);
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
        const data = await loadDashboard(this, () => this.orm.call("account.move", "invoice_modern_dashboard", [this.state.period]));
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
    get debtors() {
        return this.state.data.debtors.map((d) => ({ ...d, partner: d.id, sub: `${d.count} ${_t("overdue invoices")}` }));
    }
    get creditors() {
        return this.state.data.creditors.map((d) => ({ ...d, partner: d.id, sub: `${d.count} ${_t("open bills")}` }));
    }
    paymentPill(o) {
        if (o.payment_state === "paid") {
            return { tone: "green", label: _t("Paid"), icon: "fa-check" };
        }
        if (o.payment_state === "in_payment") {
            return { tone: "teal", label: _t("In payment") };
        }
        if (o.payment_state === "reversed") {
            return { tone: "slate", label: _t("Reversed") };
        }
        if (o.move_type === "out_refund") {
            return { tone: "slate", label: _t("To refund") }; // money we give back, not owed to us
        }
        if (o.invoice_date_due && o.invoice_date_due < this.state.data.today) {
            return { tone: "rose", label: o.payment_state === "partial" ? _t("Partly paid · late") : _t("Overdue") };
        }
        return { tone: o.payment_state === "partial" ? "amber" : "violet", label: o.payment_state === "partial" ? _t("Partly paid") : _t("Not paid") };
    }

    // ---------- navigation: Odoo's own lists and forms ----------
    openMoves(name, domain, moveType = "out_invoice") {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "account.move",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain,
            context: { default_move_type: moveType },
            target: "current",
        });
    }
    openPayments(name, paymentType) {
        const [start] = this.state.data.range;
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "account.payment",
            views: [[false, "list"], [false, "form"]],
            domain: [
                ["payment_type", "=", paymentType], ["partner_type", "=", paymentType === "inbound" ? "customer" : "supplier"],
                ["state", "in", ["in_process", "paid"]], ["date", ">=", start],
            ],
            target: "current",
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newInvoice() {
        return openFullForm(this.action, "account.move", false, { context: { default_move_type: "out_invoice" } });
    }
    openMove(o) {
        return openFullForm(this.action, "account.move", o.id);
    }
    openPartner(item) {
        return openFullForm(this.action, "res.partner", item.id);
    }
    openInvoiced() {
        const [start] = this.state.data.range;
        return this.openMoves(_t("Invoiced this period"), [["move_type", "in", OUT], ["state", "=", "posted"], ["invoice_date", ">=", start]]);
    }
    openBilled() {
        const [start] = this.state.data.range;
        return this.openMoves(_t("Billed this period"), [["move_type", "in", IN], ["state", "=", "posted"], ["invoice_date", ">=", start]], "in_invoice");
    }
    openReceivable() {
        return this.openMoves(_t("Open invoices"), [["move_type", "in", OUT], ["state", "=", "posted"], ["payment_state", "in", OPEN]]);
    }
    openPayable() {
        return this.openMoves(_t("Open bills"), [["move_type", "in", IN], ["state", "=", "posted"], ["payment_state", "in", OPEN]], "in_invoice");
    }
    openAttention(item) {
        const { today, week } = this.state.data;
        switch (item.key) {
            case "draft_out":
                return this.openMoves(item.label, [["move_type", "in", OUT], ["state", "=", "draft"]]);
            case "not_sent":
                return this.openMoves(item.label, [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["is_move_sent", "=", false], ["payment_state", "in", OPEN]]);
            case "overdue_out":
                return this.openMoves(item.label, [["move_type", "in", OUT], ["state", "=", "posted"], ["payment_state", "in", OPEN], ["invoice_date_due", "<", today]]);
            case "draft_in":
                return this.openMoves(item.label, [["move_type", "in", IN], ["state", "=", "draft"]], "in_invoice");
            case "due_soon":
                return this.openMoves(item.label, [["move_type", "in", IN], ["state", "=", "posted"], ["payment_state", "in", OPEN], ["invoice_date_due", ">=", today], ["invoice_date_due", "<=", week]], "in_invoice");
            case "overdue_in":
                return this.openMoves(item.label, [["move_type", "in", IN], ["state", "=", "posted"], ["payment_state", "in", OPEN], ["invoice_date_due", "<", today]], "in_invoice");
        }
    }
}

registry.category("actions").add("invoice_modern.dashboard", InvoicingDashboard);
