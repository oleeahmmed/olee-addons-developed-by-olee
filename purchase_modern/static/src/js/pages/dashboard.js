import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, number, pct, periodCaption } from "../dash/kit";
import { greeting, shortDate } from "../core/utils";
import { openFullForm } from "./list_pages";

const STORE_KEY = "purchase_modern.dashboard";

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Owner dashboard of the Purchase app: how much we spend, with whom, where, by whom,
 * what must be chased today, and the money still going out. One server call
 * (purchase.order.purchase_modern_owner_dashboard), read with the user's own rights.
 */
export class PurchaseDashboard extends Component {
    static template = "purchase_modern.Dashboard";
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
                user.checkAccessRight("purchase.order", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        this.state.busy = true;
        try {
            const data = await this.orm.call("purchase.order", "purchase_modern_owner_dashboard", [this.state.period]);
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
    get f() {
        return this.state.data.finance;
    }
    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get buyers() {
        return this.state.data.buyers.map((b) => ({
            id: b.id, avatar: b.id, label: b.name, value: b.value,
            sub: [`${b.orders} ${_t("orders")}`, b.conversion === null ? "" : `${b.conversion}% ${_t("conversion")}`].filter(Boolean).join(" · "),
        }));
    }
    get vendors() {
        return this.state.data.vendors.map((v) => ({ ...v, partner: v.id, sub: `${v.orders} ${_t("orders")}` }));
    }
    get products() {
        return this.state.data.products.map((p) => ({ ...p, sub: `${number(Math.round(p.qty))} ${_t("units")}` }));
    }
    get creditors() {
        return (this.f?.creditors || []).map((d) => ({ ...d, partner: d.id, sub: `${d.count} ${_t("overdue bills")}` }));
    }

    // ---------- navigation: Odoo's own lists and forms ----------
    periodDomain(field = "date_order") {
        const [start] = this.state.data.range;
        return [[field, ">=", `${start} 00:00:00`]];
    }
    openOrders(name, domain) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "purchase.order",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain,
            target: "current",
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newRfq() {
        return openFullForm(this.action, "purchase.order", false);
    }
    openOrder(order) {
        return openFullForm(this.action, "purchase.order", order.id);
    }
    openVendor(item) {
        return openFullForm(this.action, "res.partner", item.id);
    }
    openProduct(item) {
        return this.action.doAction({
            type: "ir.actions.act_window", res_model: "product.product", res_id: item.id,
            views: [[false, "form"]], target: "current",
        });
    }
    openBuyer(item) {
        return this.openOrders(item.label, [["state", "=", "purchase"], ["user_id", "=", item.id], ...this.periodDomain()]);
    }
    openSpent() {
        return this.openOrders(_t("Purchases this period"), [["state", "=", "purchase"], ...this.periodDomain()]);
    }
    openAttention(item) {
        const today = this.state.data.today;
        const weekAgo = luxon.DateTime.fromISO(today).minus({ days: 7 }).toISODate();
        switch (item.key) {
            case "waiting":
                return this.openOrders(item.label, [["state", "=", "sent"], ["date_order", "<", `${weekAgo} 00:00:00`]]);
            case "to_bill":
                return this.openOrders(item.label, [["invoice_status", "=", "to invoice"]]);
            case "late":
                return this.openOrders(item.label, [["state", "=", "purchase"], ["is_late", "=", true]]);
            case "overdue":
                return this.openBills(item.label, [["invoice_date_due", "<", today]]);
        }
    }
    openBills(name, extra = []) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "account.move",
            views: [[false, "list"], [false, "form"]],
            domain: [["move_type", "in", ["in_invoice", "in_refund"]], ["state", "=", "posted"], ["payment_state", "in", ["not_paid", "partial"]], ...extra],
            context: { default_move_type: "in_invoice" },
            target: "current",
        });
    }
}

registry.category("actions").add("purchase_modern.dashboard", PurchaseDashboard);
