import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, number, pct, periodCaption } from "../dash/kit";
import { greeting, shortDate, shortDateTime } from "../core/utils";
import { openFullForm } from "./list_pages";

const STORE_KEY = "modern_inventory.dashboard";
const CODE_INFO = {
    incoming: { label: _t("Receipts"), icon: "fa-download", tone: "teal", action: "modern_inventory.action_receipts" },
    outgoing: { label: _t("Deliveries"), icon: "fa-truck", tone: "blue", action: "modern_inventory.action_deliveries" },
    internal: { label: _t("Internal"), icon: "fa-exchange", tone: "violet", action: "modern_inventory.action_internal" },
};

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Owner dashboard of the Inventory app: what the stock is worth, what moves and what
 * sleeps, what must go out or come in today, and what is late or about to run out.
 * One call (stock.picking.modern_inventory_dashboard), read with the user's own rights.
 */
export class InventoryDashboard extends Component {
    static template = "modern_inventory.Dashboard";
    static components = { ...OD_COMPONENTS };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        const saved = remembered();
        this.state = useState({
            loading: true, busy: false, data: null, canCreate: false,
            period: saved.period || "month",
            warehouseId: saved.warehouseId || false,
        });
        this.firstName = (user.name || "").split(" ")[0];
        this.greeting = greeting();
        this.pct = pct;
        this.number = number;
        this.codeInfo = CODE_INFO;
        this.m = (v) => this.fmt.full(v);
        this.ms = (v) => this.fmt.short(v);
        this.units = (v) => number(Math.round(v || 0));
        this.unitsAxis = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v)));
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("stock.picking", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        this.state.busy = true;
        try {
            const data = await this.orm.call("stock.picking", "modern_inventory_dashboard", [this.state.period, this.state.warehouseId || false]);
            if (this.state.warehouseId && !data.warehouse_options.some((w) => w.id === this.state.warehouseId)) {
                this.state.warehouseId = false;
            }
            this.fmt = moneyFormatters(data.currency_id, data.lakh);
            this.state.data = data;
        } finally {
            this.state.loading = false;
            this.state.busy = false;
        }
    }

    onFilters(change) {
        if ("teamId" in change) {
            this.state.warehouseId = change.teamId;
        }
        if ("period" in change) {
            this.state.period = change.period;
        }
        try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify({ period: this.state.period, warehouseId: this.state.warehouseId }));
        } catch {
            // private mode: the choice is simply not remembered
        }
        return this.load();
    }

    // ---------- figures ----------
    get k() {
        return this.state.data.kpis;
    }
    get caption() {
        return periodCaption(this.state.data.range, this.state.data.period);
    }
    get compare() {
        return compareWord(this.state.data.period);
    }
    get ytdOut() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get movers() {
        return this.state.data.movers.map((p) => ({
            id: p.id, label: p.label, value: p.value, sub: `${number(Math.round(p.on_hand))} ${p.uom} ${_t("on hand")}`,
        }));
    }
    get sleeping() {
        return this.state.data.sleeping.map((p) => ({
            id: p.id, label: p.label, value: p.value, sub: `${number(Math.round(p.qty))} ${p.uom} · ${_t("no sale in 90 days")}`,
        }));
    }
    get warehouses() {
        return this.state.data.warehouses.map((w) => ({ id: w.id, label: w.label, value: w.value, sub: `${w.code} · ${w.products} ${_t("products in stock")}` }));
    }
    shortDate(v) {
        return shortDate(v);
    }
    shortDateTime(v) {
        return shortDateTime(v);
    }
    isLate(p) {
        return p.scheduled_date && p.scheduled_date < this.state.data.now && ["confirmed", "waiting", "assigned"].includes(p.state);
    }
    stateLabel(p) {
        return {
            draft: _t("Draft"), waiting: _t("Waiting"), confirmed: _t("Waiting"), assigned: _t("Ready"),
            done: _t("Done"), cancel: _t("Cancelled"),
        }[p.state] || p.state;
    }
    stateTone(p) {
        if (this.isLate(p)) {
            return "rose";
        }
        return { draft: "slate", waiting: "amber", confirmed: "amber", assigned: "green", done: "teal", cancel: "slate" }[p.state] || "slate";
    }
    lowPct(row) {
        return row.min ? Math.max(0, Math.min(100, Math.round((row.forecast * 100) / row.min))) : 0;
    }

    // ---------- navigation: Odoo's own lists and forms ----------
    whDomain() {
        return this.state.warehouseId ? [["picking_type_id.warehouse_id", "=", this.state.warehouseId]] : [];
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    openTransfers(name, domain) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "stock.picking",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain: [...domain, ...this.whDomain()],
            context: { contact_display: "partner_address" },
            target: "current",
        });
    }
    openPicking(p) {
        return openFullForm(this.action, "stock.picking", p.id);
    }
    openProduct(item) {
        return this.action.doAction({
            type: "ir.actions.act_window", res_model: "product.product", res_id: item.product_id || item.id,
            views: [[false, "form"]], target: "current",
        });
    }
    openOp(op, state) {
        const now = this.state.data.now;
        const base = [["picking_type_code", "=", op.code]];
        const label = `${CODE_INFO[op.code].label} · `;
        switch (state) {
            case "ready":
                return this.openTransfers(label + _t("Ready"), [...base, ["state", "=", "assigned"]]);
            case "waiting":
                return this.openTransfers(label + _t("Waiting"), [...base, ["state", "in", ["confirmed", "waiting"]]]);
            case "late":
                return this.openTransfers(label + _t("Late"), [...base, ["state", "in", ["confirmed", "waiting", "assigned"]], ["scheduled_date", "<", now]]);
            case "draft":
                return this.openTransfers(label + _t("Draft"), [...base, ["state", "=", "draft"]]);
            default:
                return this.go(CODE_INFO[op.code].action);
        }
    }
    openAttention(item) {
        const now = this.state.data.now;
        switch (item.key) {
            case "late_out":
                return this.openTransfers(item.label, [["picking_type_code", "=", "outgoing"], ["state", "in", ["confirmed", "waiting", "assigned"]], ["scheduled_date", "<", now]]);
            case "late_in":
                return this.openTransfers(item.label, [["picking_type_code", "=", "incoming"], ["state", "in", ["confirmed", "waiting", "assigned"]], ["scheduled_date", "<", now]]);
            case "waiting_out":
                return this.openTransfers(item.label, [["picking_type_code", "=", "outgoing"], ["state", "in", ["confirmed", "waiting"]]]);
            case "backorders":
                return this.openTransfers(item.label, [["backorder_id", "!=", false], ["state", "in", ["draft", "waiting", "confirmed", "assigned"]]]);
            case "reorder":
                return this.go("stock.action_replenishment");
            case "out_of_stock":
                return this.action.doAction({
                    type: "ir.actions.act_window", name: item.label, res_model: "product.product",
                    views: [[false, "list"], [false, "form"]],
                    domain: [["is_storable", "=", true], ["qty_available", "<=", 0]],
                    target: "current",
                });
            case "negative":
                return this.action.doAction({
                    type: "ir.actions.act_window", name: item.label, res_model: "stock.quant",
                    views: [[false, "list"]],
                    domain: [["location_id.usage", "=", "internal"], ["quantity", "<", 0]],
                    context: { create: false },
                    target: "current",
                });
        }
    }
    newTransfer(code) {
        return this.action.doAction({
            type: "ir.actions.act_window", res_model: "stock.picking", views: [[false, "form"]],
            context: { restricted_picking_type_code: code, contact_display: "partner_address" }, target: "current",
        });
    }
}

registry.category("actions").add("modern_inventory.dashboard", InventoryDashboard);
