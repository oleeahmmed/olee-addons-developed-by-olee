import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, number, periodCaption, loadDashboard, dayStart } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDate } from "@modern_theme/js/app_kit/utils";
import { openFullForm } from "@modern_theme/js/app_kit/list_page";
import { usePinApp } from "./app_context";

const STORE_KEY = "employee_modern.dashboard";

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

const TYPE_TONES = { employee: "blue", worker: "teal", student: "violet", trainee: "amber", contractor: "sky", freelance: "rose" };

/**
 * People dashboard of the Employees app: headcount, hires and departures, where people
 * work, what HR should look at (contracts, trial periods, permits) and — when Time Off or
 * Attendances are installed — who is out or in today. One server call
 * (hr.employee.employee_modern_dashboard), read with the user's own rights.
 */
export class EmployeesDashboard extends Component {
    static template = "employee_modern.Dashboard";
    static components = { ...OD_COMPONENTS };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        usePinApp("hr.menu_hr_root");
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
                user.checkAccessRight("hr.employee", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        const data = await loadDashboard(this, () =>
            this.orm.call("hr.employee", "employee_modern_dashboard", [this.state.period, this.state.teamId || false])
        );
        if (!data) {
            return;
        }
        this.state.data = data;
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
    get departments() {
        return this.state.data.department_list || [];
    }
    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get tenure() {
        const t = this.k.tenure;
        return t === null || t === undefined ? "—" : `${number(t)} ${_t("yrs")}`;
    }
    get byDepartment() {
        return this.state.data.by_department.map((d) => ({ ...d, sub: "" }));
    }
    get birthdays() {
        return this.state.data.birthdays.map((b) => ({
            id: b.id,
            name: b.name,
            text: b.text || "",
            time: b.days === 0 ? _t("Today 🎂") : b.days === 1 ? _t("Tomorrow") : shortDate(b.date),
            avatar: `/web/image/hr.employee/${b.id}/avatar_128`,
        }));
    }

    // ---------- shadcn block: the latest employees table ----------
    get employeeColumns() {
        return [
            { key: "name", label: _t("Employee"), type: "person" },
            { key: "department", label: _t("Department") },
            { key: "manager", label: _t("Manager"), type: "muted" },
            { key: "kind", label: _t("Type"), type: "badge" },
            { key: "since", label: _t("Since"), type: "muted", align: "end" },
        ];
    }
    get employeeRows() {
        const types = Object.fromEntries((this.state.data.by_type || []).map((t) => [t.key, t.label]));
        return this.state.data.recent.map((e) => ({
            id: e.id,
            name: e.name,
            name_sub: e.job_title || (e.job_id ? e.job_id[1] : "") || e.work_email || "",
            name_avatar: `/web/image/hr.employee/${e.id}/avatar_128`,
            department: e.department_id ? e.department_id[1] : "—",
            manager: e.parent_id ? e.parent_id[1] : "—",
            kind: types[e.employee_type] || e.employee_type || "",
            kind_tone: TYPE_TONES[e.employee_type] || "slate",
            since: shortDate(e.contract_date_start || e.create_date),
        }));
    }

    // ---------- navigation: Odoo's own lists and forms ----------
    scope() {
        const d = this.state.teamId;
        return d ? [["department_id", "child_of", d]] : [];
    }
    openEmployees(name, domain, context = {}) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "hr.employee",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain: [...this.scope(), ...domain],
            context: { chat_icon: true, ...context },
            target: "current",
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newEmployee() {
        const context = this.state.teamId ? { default_department_id: this.state.teamId } : {};
        return openFullForm(this.action, "hr.employee", false, { context });
    }
    openEmployee(item) {
        return openFullForm(this.action, "hr.employee", item.id);
    }
    openHires() {
        const [start] = this.state.data.range;
        return this.openEmployees(_t("New hires"), [["contract_date_start", ">=", start]]);
    }
    openDepartures() {
        const [start] = this.state.data.range;
        return this.openEmployees(
            _t("Departures"),
            [["active", "=", false], ["departure_date", ">=", start]],
            { active_test: false }
        );
    }
    openDepartment(item) {
        return this.openEmployees(item.label, [["department_id", "=", item.id || false]]);
    }
    openJob(item) {
        return this.openEmployees(item.label, [["job_id", "=", item.id]]);
    }
    openType(item) {
        return this.openEmployees(item.label, [["employee_type", "=", item.key]]);
    }
    openGender(item) {
        return this.openEmployees(item.label, [["sex", "=", item.key]]);
    }
    openAttention(item) {
        return this.openEmployees(item.label, item.domain || []);
    }
    openPresence(item) {
        const today = this.state.data.today;
        switch (item.key) {
            case "out":
                return this.action.doAction({
                    type: "ir.actions.act_window",
                    name: item.label,
                    res_model: "hr.leave",
                    views: [[false, "list"], [false, "calendar"], [false, "form"]],
                    domain: [
                        ["state", "=", "validate"],
                        ["date_from", "<", dayStart(luxon.DateTime.fromISO(today).plus({ days: 1 }).toISODate())],
                        ["date_to", ">=", dayStart(today)],
                    ],
                    target: "current",
                });
            case "pending":
                return this.go("time_off_modern.action_requests").catch(() =>
                    this.action.doAction({
                        type: "ir.actions.act_window",
                        name: item.label,
                        res_model: "hr.leave",
                        views: [[false, "list"], [false, "form"]],
                        domain: [["state", "in", ["confirm", "validate1"]]],
                        target: "current",
                    })
                );
            case "present":
                return this.go("attendance_modern.action_at_work").catch(() =>
                    this.action.doAction({
                        type: "ir.actions.act_window",
                        name: item.label,
                        res_model: "hr.attendance",
                        views: [[false, "list"], [false, "form"]],
                        domain: [["check_out", "=", false]],
                        target: "current",
                    })
                );
        }
    }
}

registry.category("actions").add("employee_modern.dashboard", EmployeesDashboard);
