import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, dayStart, loadDashboard, moneyFormatters, number, periodCaption } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDateTime } from "@modern_theme/js/app_kit/utils";
import { usePinApp } from "./app_context";
import { ProductDrawer, openQuickDrawer } from "./drawer";
import { APP_XMLID, openFullForm } from "./pages";

const STORE_KEY = "pos_modern.dashboard";
const STATE_TONES = { draft: "amber", paid: "blue", done: "teal", invoiced: "violet", cancel: "slate" };

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Shop owner's dashboard: revenue, orders, average basket, customers, refunds and open
 * sessions, revenue through the year, what needs attention, best sellers, sales per shop
 * and per payment method, the shops right now and the latest orders. One server call
 * (pos.order.pos_modern_dashboard), read with the user's own rights.
 */
export class PosDashboard extends Component {
    static template = "pos_modern.Dashboard";
    static components = { ...OD_COMPONENTS };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        usePinApp(APP_XMLID);
        const saved = remembered();
        this.state = useState({
            loading: true,
            busy: false,
            error: false,
            data: null,
            canCreate: false,
            period: saved.period || "month",
            teamId: saved.teamId || false,
        });
        this.firstName = (user.name || "").split(" ")[0];
        this.greeting = greeting();
        this.number = number;
        this.count = (v) => number(Math.round(v || 0));
        this.fmt = moneyFormatters(false, false);
        this.money = (v) => this.fmt.short(v);
        this.moneyFull = (v) => this.fmt.full(v);
        this.axis = (v) => this.fmt.axis(v);
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("product.template", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        const data = await loadDashboard(this, () =>
            this.orm.call("pos.order", "pos_modern_dashboard", [this.state.period, this.state.teamId || false])
        );
        if (data) {
            this.fmt = moneyFormatters(data.currency_id, data.currency_name === "BDT");
            this.state.data = data;
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
    get caption() {
        return periodCaption(this.state.data.range, this.state.data.period);
    }
    get compare() {
        return compareWord(this.state.data.period);
    }
    get k() {
        return this.state.data.kpis;
    }
    get shopList() {
        return this.state.data.shop_list || [];
    }
    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get orderColumns() {
        return [
            { key: "ref", label: _t("Order") },
            { key: "customer", label: _t("Customer"), type: "person" },
            { key: "shop", label: _t("Shop"), type: "muted" },
            { key: "state", label: _t("Status"), type: "badge" },
            { key: "amount", label: _t("Total"), type: "num", align: "end" },
        ];
    }
    get orderRows() {
        const states = { draft: _t("Ongoing"), paid: _t("Paid"), done: _t("Posted"), invoiced: _t("Invoiced"), cancel: _t("Cancelled") };
        return this.state.data.recent.map((o) => ({
            id: o.id,
            ref: o.pos_reference || o.name,
            customer: o.partner_id ? o.partner_id[1] : _t("Walk-in customer"),
            customer_sub: shortDateTime(o.date_order),
            shop: o.config_id ? o.config_id[1] : "",
            state: states[o.state] || o.state,
            state_tone: STATE_TONES[o.state] || "slate",
            amount: this.fmt.record(o.amount_total, o.currency_id),
        }));
    }

    // ---------- navigation ----------
    scope() {
        const c = this.state.teamId;
        return c ? [["config_id", "=", c]] : [];
    }
    sinceStart() {
        return ["date_order", ">=", dayStart(this.state.data.range[0])];
    }
    openOrders(name, domain, extra = {}) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "pos.order",
            views: [[false, "list"], [false, "form"]],
            domain: [...this.scope(), ...domain],
            target: "current",
            ...extra,
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newProduct() {
        return openQuickDrawer(this.dialog, ProductDrawer, {}).then(() => this.load());
    }
    openSales() {
        return this.openOrders(_t("Sales"), [["state", "in", ["paid", "done", "invoiced"]], this.sinceStart()]);
    }
    openRefunds() {
        return this.openOrders(_t("Refunds"), [["amount_total", "<", 0], this.sinceStart()]);
    }
    openCustomers() {
        return this.openOrders(_t("Orders with a customer"), [["partner_id", "!=", false], this.sinceStart()]);
    }
    openAttention(item) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name: item.label,
            res_model: item.model,
            views: [[false, "list"], [false, "form"]],
            domain: item.domain || [],
            target: "current",
        });
    }
    openProduct(item) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name: item.label,
            res_model: "pos.order.line",
            views: [[false, "list"], [false, "form"]],
            domain: [["product_id", "=", item.id], ["order_id.date_order", ">=", dayStart(this.state.data.range[0])]],
            target: "current",
        });
    }
    openShop(item) {
        return this.openOrders(item.label, [["config_id", "=", item.id || item.key], this.sinceStart()]);
    }
    openMethod(item) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name: item.label,
            res_model: "pos.payment",
            views: [[false, "list"], [false, "form"]],
            domain: [["payment_method_id", "=", item.id], ["payment_date", ">=", dayStart(this.state.data.range[0])]],
            target: "current",
        });
    }
    openOrder(row) {
        return openFullForm(this.action, "pos.order", row.id);
    }
}

registry.category("actions").add("pos_modern.dashboard", PosDashboard);
