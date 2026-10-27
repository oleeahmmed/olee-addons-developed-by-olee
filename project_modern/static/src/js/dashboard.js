import { Component, onWillStart, useState } from "@odoo/owl";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, number, periodCaption, loadDashboard } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDate } from "@modern_theme/js/app_kit/utils";
import { usePinApp } from "./app_context";
import { TaskDrawer, openQuickDrawer } from "./drawer";
import { APP_XMLID, openBoard, openFullForm } from "./pages";

const STORE_KEY = "project_modern.dashboard";
const PRIORITY = { 3: "high", 2: "high", 1: "medium", 0: "low" };
const CLOSED = ["1_done", "1_canceled"];

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Projects dashboard: open, completed, overdue and due tasks, completion through the year,
 * what needs attention, where the work is (stages, people, states), project progress and
 * the user's own tasks. One server call (project.task.project_modern_dashboard), read with
 * the user's own rights.
 */
export class ProjectDashboard extends Component {
    static template = "project_modern.Dashboard";
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
        this.axis = (v) => number(Math.round(v || 0));
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("project.task", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        const data = await loadDashboard(this, () =>
            this.orm.call("project.task", "project_modern_dashboard", [this.state.period, this.state.teamId || false])
        );
        if (data) {
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
    get projectList() {
        return this.state.data.project_list || [];
    }
    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get byStage() {
        return this.state.data.by_stage.map((s) => ({ ...s, value: this.count(s.value), sub: `${s.pct}%`, rawValue: s.value }));
    }
    get myTasks() {
        const now = luxon.DateTime.now();
        return this.state.data.my_tasks.map((t) => {
            let due = "";
            let dueTone = "";
            if (t.deadline) {
                const d = deserializeDateTime(t.deadline);
                const days = Math.floor(d.startOf("day").diff(now.startOf("day"), "days").days);
                due = days < 0 ? _t("%s days late", -days) : days === 0 ? _t("Today") : days === 1 ? _t("Tomorrow") : shortDate(d.toISODate());
                dueTone = days < 0 ? "rose" : days <= 1 ? "amber" : "";
            }
            return {
                id: t.id,
                title: t.name,
                sub: [t.project, t.parent].filter(Boolean).join(" · "),
                priority: PRIORITY[t.priority] || "low",
                due,
                dueTone,
            };
        });
    }

    // ---------- navigation ----------
    scope() {
        const p = this.state.teamId;
        return p ? [["project_id", "=", p]] : [];
    }
    openTasks(name, domain, context = {}) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "project.task",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain: [["is_template", "=", false], ...this.scope(), ...domain],
            context,
            target: "current",
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newTask() {
        const context = this.state.teamId ? { default_project_id: this.state.teamId } : {};
        return openQuickDrawer(this.dialog, TaskDrawer, { context }).then(() => this.load());
    }
    openTask(item) {
        return openFullForm(this.action, "project.task", item.id);
    }
    async markDone(item) {
        await this.orm.call("project.task", "project_modern_mark_done", [item.id]);
        return this.load();
    }
    openOpen() {
        return this.openTasks(_t("Open tasks"), [["state", "not in", CLOSED]]);
    }
    openDone() {
        const [start] = this.state.data.range;
        return this.openTasks(_t("Completed tasks"), [["state", "in", CLOSED], ["date_end", ">=", `${start} 00:00:00`]]);
    }
    openCreated() {
        const [start] = this.state.data.range;
        return this.openTasks(_t("New tasks"), [["create_date", ">=", `${start} 00:00:00`]]);
    }
    openDueWeek() {
        const end = this.state.data.week_end;
        return this.openTasks(_t("Due this week"), [
            ["state", "not in", CLOSED],
            ["date_deadline", ">=", luxon.DateTime.now().startOf("day").toUTC().toFormat("yyyy-MM-dd HH:mm:ss")],
            ["date_deadline", "<", luxon.DateTime.fromISO(end).toUTC().toFormat("yyyy-MM-dd HH:mm:ss")],
        ]);
    }
    openStage(item) {
        const stage = this.state.data.by_stage.find((s) => s.id === item.id);
        return this.openTasks(item.label, [["state", "not in", CLOSED], ["stage_id", "in", stage?.stage_ids || []]]);
    }
    openUser(item) {
        const domain = item.id ? [["user_ids", "in", [item.id]]] : [["user_ids", "=", false]];
        return this.openTasks(item.label, [["state", "not in", CLOSED], ...domain]);
    }
    openState(item) {
        return this.openTasks(item.label, [["state", "=", item.key]]);
    }
    openAttention(item) {
        return this.openTasks(item.label, [["state", "not in", CLOSED], ...(item.domain || [])]);
    }
    openProject(item) {
        return openBoard(this.action, item.id, item.label);
    }
}

registry.category("actions").add("project_modern.dashboard", ProjectDashboard);
