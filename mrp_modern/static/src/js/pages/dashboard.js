import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, number, pct, periodCaption } from "../dash/kit";
import { greeting, shortDate } from "../core/utils";
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
        this.state.busy = true;
        try {
            this.state.data = await this.orm.call("mrp.production", "mrp_modern_owner_dashboard", [this.state.period]);
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
        return [[field, ">=", `${start} 00:00:00`]];
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
                    ["date_deadline", "<", `${today} 00:00:00`],
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
