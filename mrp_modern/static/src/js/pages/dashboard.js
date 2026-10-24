import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, number, pct, periodCaption, loadDashboard, dayStart } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDate } from "@modern_theme/js/app_kit/utils";
import { openFullForm } from "./list_pages";

const STORE_KEY = "mrp_modern.dashboard";
const STATE_PILL = {
    draft: { label: _t("Draft"), tone: "slate" },
    confirmed: { label: _t("Confirmed"), tone: "sky" },
    progress: { label: _t("In progress"), tone: "amber" },
    to_close: { label: _t("To close"), tone: "violet" },
    done: { label: _t("Done"), tone: "green" },
    cancel: { label: _t("Cancelled"), tone: "rose" },
};

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

export class MrpDashboard extends Component {
    static template = "mrp_modern.Dashboard";
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
        this.statePill = STATE_PILL;
        this.units = (v) => number(Math.round(v || 0));
        this.unitsAxis = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v)));
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("mrp.production", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        const data = await loadDashboard(this, () => this.orm.call("mrp.production", "mrp_modern_owner_dashboard", [this.state.period]));
        if (data) {
            this.state.data = data;
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
    get products() {
        return this.state.data.products.map((p) => ({
            ...p,
            sub: `${number(Math.round(p.qty))} ${_t("units")} · ${p.orders} ${_t("orders")}`,
        }));
    }

    periodDomain(field = "date_finished") {
        const [start] = this.state.data.range;
        return [[field, ">=", dayStart(start)]];
    }
    openMos(name, domain) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "mrp.production",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain,
            target: "current",
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newMo() {
        return openFullForm(this.action, "mrp.production", false);
    }
    // ---------- shadcn blocks: order status tiles and the orders table ----------
    get statusTiles() {
        const st = this.state.data.status || {};
        return [
            { key: "draft", label: _t("Draft"), count: number(st.draft), sub: _t("not confirmed yet"), tone: "slate", icon: "fa-file-o" },
            { key: "confirmed", label: _t("Confirmed"), count: number(st.confirmed), sub: _t("planned, not started"), tone: "sky", icon: "fa-calendar" },
            { key: "progress", label: _t("In progress"), count: number(st.progress), sub: _t("being made now"), tone: "amber", icon: "fa-cogs" },
            { key: "to_close", label: _t("To close"), count: number(st.to_close), sub: _t("made, to close"), tone: "violet", icon: "fa-flag-checkered" },
            { key: "done", label: _t("Done"), count: number(st.done), sub: _t("finished this period"), tone: "green", icon: "fa-check" },
        ];
    }
    openStatus(tile) {
        if (tile.key === "done") {
            return this.openDone();
        }
        return this.openMos(tile.label, [["state", "=", tile.key]]);
    }
    get moColumns() {
        return [
            { key: "product", label: _t("Product"), type: "person" },
            { key: "qty", label: _t("Quantity"), type: "num" },
            { key: "user", label: _t("Responsible"), type: "muted" },
            { key: "start", label: _t("Start"), type: "muted" },
            { key: "status", label: _t("Status"), type: "badge" },
        ];
    }
    get moRows() {
        return this.state.data.recent.map((o) => {
            const pill = this.statePill[o.state] || { label: o.state, tone: "slate" };
            return {
                id: o.id,
                product: o.product_id ? o.product_id[1] : "—",
                product_sub: o.name,
                qty: `${this.units(o.product_qty)} ${o.product_uom_id ? o.product_uom_id[1] : ""}`,
                user: o.user_id ? o.user_id[1] : "",
                start: shortDate(o.date_start),
                status: pill.label, status_tone: pill.tone,
            };
        });
    }
    openMo(order) {
        return openFullForm(this.action, "mrp.production", order.id);
    }
    openProduct(item) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "product.product",
            res_id: item.id,
            views: [[false, "form"]],
            target: "current",
        });
    }
    openDone() {
        return this.openMos(_t("Finished this period"), [["state", "=", "done"], ...this.periodDomain()]);
    }
    openAttention(item) {
        const today = this.state.data.today;
        switch (item.key) {
            case "late":
                return this.openMos(item.label, [
                    ["state", "in", ["confirmed", "progress", "to_close"]],
                    ["date_deadline", "<", dayStart(today)],
                ]);
            case "waiting":
                return this.openMos(item.label, [
                    ["state", "in", ["confirmed", "progress", "to_close"]],
                    ["components_availability_state", "in", ["unavailable", "late"]],
                ]);
            case "to_close":
                return this.openMos(item.label, [["state", "=", "to_close"]]);
            case "draft":
                return this.openMos(item.label, [["state", "=", "draft"]]);
            case "workorders":
                return this.go("mrp_modern.action_workorders");
        }
    }
}

registry.category("actions").add("mrp_modern.dashboard", MrpDashboard);
