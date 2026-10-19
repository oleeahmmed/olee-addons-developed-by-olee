import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, number, pct, periodCaption } from "../dash/kit";
import { greeting, shortDate } from "../core/utils";
import { openFullForm } from "./list_pages";

const STORE_KEY = "sales_modern.dashboard";

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Owner dashboard of the Sales app: how much we sell, to whom, where, by whom, what
 * must be chased today, and the money still to come in. One server call
 * (sale.order.sales_modern_owner_dashboard), read with the user's own rights.
 */
export class SalesDashboard extends Component {
    static template = "sales_modern.Dashboard";
    static components = { ...OD_COMPONENTS };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        const saved = remembered();
        this.state = useState({
            loading: true,
            busy: false,
            data: null,
            canCreate: false,
            period: saved.period || "month",
            teamId: saved.teamId || false,
        });
        this.firstName = (user.name || "").split(" ")[0];
        this.greeting = greeting();
        this.pct = pct;
        this.number = number;
        this.m = (v) => this.fmt.full(v);
        this.ms = (v) => this.fmt.short(v);
        this.axis = (v) => this.fmt.axis(v);
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("sale.order", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        this.state.busy = true;
        try {
            const data = await this.orm.call("sale.order", "sales_modern_owner_dashboard", [this.state.period, this.state.teamId || false]);
            if (this.state.teamId && !data.team_options.some((t) => t.id === this.state.teamId)) {
                this.state.teamId = false;
            }
            this.fmt = moneyFormatters(data.currency_id, data.lakh);
            this.state.data = data;
        } finally {
            this.state.loading = false;
            this.state.busy = false;
        }
    }

    onFilters(change) {
        Object.assign(this.state, change);
        try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify({ period: this.state.period, teamId: this.state.teamId }));
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
    get f() {
        return this.state.data.finance;
    }
    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get salespeople() {
        return this.state.data.salespeople.map((s) => ({
            id: s.id, avatar: s.id, label: s.name, value: s.value,
            sub: [`${s.orders} ${_t("orders")}`, s.conversion === null ? "" : `${s.conversion}% ${_t("conversion")}`].filter(Boolean).join(" · "),
        }));
    }
    get customers() {
        return this.state.data.customers.map((c) => ({ ...c, partner: c.id, sub: `${c.orders} ${_t("orders")}` }));
    }
    get products() {
        return this.state.data.products.map((p) => ({ ...p, sub: `${number(Math.round(p.qty))} ${_t("units")}` }));
    }
    get debtors() {
        return (this.f?.debtors || []).map((d) => ({ ...d, partner: d.id, sub: `${d.count} ${_t("overdue invoices")}` }));
    }
    targetPct(team) {
        return team.target ? Math.round((team.invoiced * 100) / team.target) : null;
    }
    targetTone(team) {
        const p = this.targetPct(team);
        return p === null ? "slate" : p >= 100 ? "green" : p >= 60 ? "blue" : "amber";
    }
    isExpired(order) {
        return Boolean(order.validity_date && order.validity_date < this.state.data.today);
    }

    // ---------- navigation: Odoo's own lists and forms ----------
    periodDomain(field = "date_order") {
        const [start] = this.state.data.range;
        const team = this.state.teamId ? [["team_id", "=", this.state.teamId]] : [];
        return [[field, ">=", `${start} 00:00:00`], ...team];
    }
    openOrders(name, domain) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "sale.order",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain,
            target: "current",
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newQuotation() {
        return openFullForm(this.action, "sale.order", false);
    }
    openOrder(order) {
        return openFullForm(this.action, "sale.order", order.id);
    }
    openCustomer(item) {
        return openFullForm(this.action, "res.partner", item.id);
    }
    openProduct(item) {
        return this.action.doAction({
            type: "ir.actions.act_window", res_model: "product.product", res_id: item.id,
            views: [[false, "form"]], target: "current",
        });
    }
    openSalesperson(item) {
        return this.openOrders(item.label, [["state", "=", "sale"], ["user_id", "=", item.id], ...this.periodDomain()]);
    }
    openTeam(team) {
        const [start] = this.state.data.range;
        return this.openOrders(team.name, [["state", "=", "sale"], ["team_id", "=", team.id], ["date_order", ">=", `${start} 00:00:00`]]);
    }
    openSold() {
        return this.openOrders(_t("Sales this period"), [["state", "=", "sale"], ...this.periodDomain()]);
    }
    openAttention(item) {
        const today = this.state.data.today;
        const team = this.state.teamId ? [["team_id", "=", this.state.teamId]] : [];
        const week = luxon.DateTime.fromISO(today).plus({ days: 7 }).toISODate();
        const weekAgo = luxon.DateTime.fromISO(today).minus({ days: 7 }).toISODate();
        switch (item.key) {
            case "expiring":
                return this.openOrders(item.label, [["state", "in", ["draft", "sent"]], ["validity_date", ">=", today], ["validity_date", "<=", week], ...team]);
            case "waiting":
                return this.openOrders(item.label, [["state", "=", "sent"], ["date_order", "<", `${weekAgo} 00:00:00`], ...team]);
            case "expired":
                return this.openOrders(item.label, [["state", "in", ["draft", "sent"]], ["validity_date", "<", today], ...team]);
            case "to_invoice":
                return this.openOrders(item.label, [["invoice_status", "=", "to invoice"], ...team]);
            case "delivery":
                return this.openOrders(item.label, [["state", "=", "sale"], ["delivery_status", "in", ["pending", "partial", "started"]], ...team]);
            case "overdue":
                return this.openInvoices(item.label, [["invoice_date_due", "<", today]]);
        }
    }
    openInvoices(name, extra = []) {
        if (!this.state.data?.finance) {
            return;
        }
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "account.move",
            views: [[false, "list"], [false, "form"]],
            domain: [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["payment_state", "in", ["not_paid", "partial"]], ...extra],
            context: { default_move_type: "out_invoice" },
            target: "current",
        });
    }
}

registry.category("actions").add("sales_modern.dashboard", SalesDashboard);
