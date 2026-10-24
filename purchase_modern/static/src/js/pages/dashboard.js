import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, number, pct, periodCaption, loadDashboard, dayStart } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDate } from "@modern_theme/js/app_kit/utils";
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
            error: false,
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
        // one record's amount, in its own currency
        this.mr = (o, v) => this.fmt.record(v, o.currency_id);
        this.msr = (o, v) => this.fmt.record(v, o.currency_id, true);
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
        const data = await loadDashboard(this, () => this.orm.call("purchase.order", "purchase_modern_owner_dashboard", [this.state.period]));
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
        return [[field, ">=", dayStart(start)]];
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
    // ---------- shadcn blocks: order status tiles and the orders table ----------
    get statusTiles() {
        const st = this.state.data.status || {};
        return [
            { key: "draft", label: _t("RFQs"), count: number(st.draft), sub: _t("not sent yet"), tone: "slate", icon: "fa-file-o" },
            { key: "sent", label: _t("RFQs sent"), count: number(st.sent), sub: _t("waiting for the vendor"), tone: "sky", icon: "fa-paper-plane-o" },
            { key: "to_approve", label: _t("To approve"), count: number(st.to_approve), sub: _t("waiting for approval"), tone: "amber", icon: "fa-hourglass-half" },
            { key: "purchase", label: _t("Confirmed"), count: number(st.purchase), sub: _t("orders this period"), tone: "green", icon: "fa-check" },
            { key: "to_bill", label: _t("To bill"), count: number(st.to_bill), sub: _t("waiting for the bill"), tone: "violet", icon: "fa-file-text-o" },
        ];
    }
    openStatus(tile) {
        const domains = {
            draft: [["state", "=", "draft"]],
            sent: [["state", "=", "sent"]],
            to_approve: [["state", "=", "to approve"]],
            purchase: [["state", "=", "purchase"], ...this.periodDomain()],
            to_bill: [["invoice_status", "=", "to invoice"]],
        };
        return this.openOrders(tile.label, domains[tile.key]);
    }
    get orderColumns() {
        return [
            { key: "vendor", label: _t("Vendor"), type: "person" },
            { key: "user", label: _t("Buyer"), type: "muted" },
            { key: "date", label: _t("Date"), type: "muted" },
            { key: "bill", label: _t("Bill"), type: "badge" },
            { key: "untaxed", label: _t("Untaxed"), type: "num", align: "end" },
            { key: "total", label: _t("Total"), type: "num", align: "end" },
        ];
    }
    get orderRows() {
        const bills = { invoiced: [_t("Billed"), "green"], "to invoice": [_t("To bill"), "violet"] };
        return this.state.data.recent.map((o) => {
            const [label, tone] = bills[o.invoice_status] || [_t("Nothing to bill"), "slate"];
            return {
                id: o.id,
                vendor: o.partner_id ? o.partner_id[1] : "—",
                vendor_sub: o.name,
                user: o.user_id ? o.user_id[1] : "",
                date: shortDate(o.date_order),
                bill: label, bill_tone: tone,
                untaxed: this.mr(o, o.amount_untaxed),
                total: this.mr(o, o.amount_total),
            };
        });
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
                return this.openOrders(item.label, [["state", "=", "sent"], ["date_order", "<", dayStart(weekAgo)]]);
            case "to_bill":
                return this.openOrders(item.label, [["invoice_status", "=", "to invoice"]]);
            case "late":
                return this.openOrders(item.label, [["state", "=", "purchase"], ["is_late", "=", true]]);
            case "overdue":
                return this.openBills(item.label, [["invoice_date_due", "<", today]]);
        }
    }
    openBills(name, extra = []) {
        if (!this.state.data?.finance) {
            return;
        }
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
