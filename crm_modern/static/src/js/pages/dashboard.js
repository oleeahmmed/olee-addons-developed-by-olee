import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, number, pct, periodCaption } from "../dash/kit";
import { greeting, openRecord, shortDate, dueInfo } from "../core/utils";
import { loadFeatures } from "../core/features";

/** Extra dashboard sections other addons register (e.g. quotations & orders with Sales). */
export const dashboardSections = registry.category("crm_modern.dashboard_sections");

const STORE_KEY = "crm_modern.dashboard";

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Owner dashboard of the CRM app: pipeline, what is won and lost, where deals come
 * from, who sells, and what is slipping. One call (crm.lead.crm_modern_owner_dashboard)
 * read with the user's own rights.
 */
export class Dashboard extends Component {
    static template = "crm_modern.Dashboard";
    static components = { ...OD_COMPONENTS };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        const saved = remembered();
        this.state = useState({
            loading: true, busy: false, data: null, features: {},
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
            const [features] = await Promise.all([loadFeatures(this.orm), this.load()]);
            this.state.features = features;
        });
    }

    async load() {
        this.state.busy = true;
        try {
            const data = await this.orm.call("crm.lead", "crm_modern_owner_dashboard", [this.state.period, this.state.teamId || false]);
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
    get sections() {
        return dashboardSections
            .getEntries()
            .filter(([, s]) => !s.isVisible || s.isVisible(this.state.features))
            .map(([key, s]) => ({ key, Component: s.Component }));
    }
    get useLeads() {
        return Boolean(this.state.features.use_leads);
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
    get forecastMax() {
        return Math.max(1, ...this.state.data.forecast.map((f) => f.value));
    }
    get sources() {
        return this.state.data.sources.map((s) => ({
            id: s.id, label: s.label, value: s.count,
            sub: `${s.won_count} ${_t("won")} · ${s.rate}% · ${this.ms(s.value)}`,
        }));
    }
    get lostReasons() {
        return this.state.data.lost_reasons.map((r) => ({ id: r.id, label: r.label, value: r.count, sub: this.ms(r.value) }));
    }
    shortDate(v) {
        return shortDate(v);
    }
    due(v) {
        return dueInfo(v);
    }
    daysSince(v) {
        if (!v) {
            return "";
        }
        const days = Math.floor(luxon.DateTime.now().diff(luxon.DateTime.fromSQL(v, { zone: "utc" }), "days").days);
        return _t("%s days", days);
    }

    // ---------- navigation: Odoo's own lists and the modern record page ----------
    go(xmlid, context = {}) {
        return this.action.doAction(xmlid, { additionalContext: context });
    }
    openDeals(name, domain) {
        const team = this.state.teamId ? [["team_id", "=", this.state.teamId]] : [];
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "crm.lead",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain: [["type", "=", "opportunity"], ...domain, ...team],
            context: { default_type: "opportunity", active_test: true },
            target: "current",
        });
    }
    openWon() {
        const [start] = this.state.data.range;
        return this.action.doAction({
            type: "ir.actions.act_window",
            name: _t("Won this period"),
            res_model: "crm.lead",
            views: [[false, "list"], [false, "form"]],
            domain: [["type", "=", "opportunity"], ["won_status", "=", "won"], ["date_closed", ">=", `${start} 00:00:00`],
                ...(this.state.teamId ? [["team_id", "=", this.state.teamId]] : [])],
            context: { active_test: false },
            target: "current",
        });
    }
    openLead(id) {
        return openRecord(this.action, id);
    }
    openStage(stage) {
        if (stage.won) {
            return this.openWon();
        }
        return this.openDeals(stage.label, [["stage_id", "=", stage.id]]);
    }
    openSalesperson(row) {
        return this.openDeals(row.name, [["user_id", "=", row.id]]);
    }
    openTeam(row) {
        return this.action.doAction("crm_modern.action_team", { additionalContext: { active_id: row.id } });
    }
    openAttention(item) {
        const today = this.state.data.today;
        switch (item.key) {
            case "overdue_activities":
                return this.go("crm_modern.action_activities");
            case "closing_late":
                return this.openDeals(item.label, [["won_status", "=", "pending"], ["date_deadline", "<", today.slice(0, 8) + "01"]]);
            case "stale": {
                const before = luxon.DateTime.utc().minus({ days: 30 }).toFormat("yyyy-LL-dd HH:mm:ss");
                return this.openDeals(item.label, [["won_status", "=", "pending"], ["date_last_stage_update", "<", before]]);
            }
            case "no_activity":
                return this.openDeals(item.label, [["won_status", "=", "pending"], ["activity_ids", "=", false]]);
            case "unassigned":
                return this.action.doAction({
                    type: "ir.actions.act_window", name: item.label, res_model: "crm.lead",
                    views: [[false, "list"], [false, "form"]],
                    domain: [["won_status", "=", "pending"], ["user_id", "=", false], ...(this.state.teamId ? [["team_id", "=", this.state.teamId]] : [])],
                    target: "current",
                });
        }
    }
}

registry.category("actions").add("crm_modern.dashboard", Dashboard);
