import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, number, periodCaption, loadDashboard } from "@modern_theme/js/app_kit/dash_kit";
import { greeting } from "@modern_theme/js/app_kit/utils";
import { openFullForm } from "@modern_theme/js/app_kit/list_page";
import { openQuickDrawer } from "../drawer/record_drawer";
import { usePinApp } from "./app_context";

export const LEAVE_STATE = {
    confirm: [_t("To Approve"), "amber"],
    validate1: [_t("Second Approval"), "violet"],
    validate: [_t("Approved"), "teal"],
    refuse: [_t("Refused"), "rose"],
    cancel: [_t("Cancelled"), "slate"],
};
export const OVERTIME_STATE = {
    to_approve: [_t("To Approve"), "amber"],
    approved: [_t("Approved"), "teal"],
    refused: [_t("Refused"), "rose"],
};

/** 7.5 → "7h 30m" */
export function hoursLabel(v) {
    const total = Math.round((v || 0) * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${number(h)}h ${m}m` : `${number(h)}h`;
}
/** UTC "YYYY-MM-DD HH:MM:SS" from the server → the user's local time. */
export function localDateTime(v) {
    return v ? luxon.DateTime.fromSQL(v, { zone: "utc" }).toLocal() : null;
}
export function timeLabel(v) {
    const dt = localDateTime(v);
    if (!dt) {
        return "—";
    }
    return dt.hasSame(luxon.DateTime.local(), "day") ? dt.toFormat("HH:mm") : dt.toFormat("dd LLL, HH:mm");
}
export function sinceLabel(v) {
    const dt = localDateTime(v);
    if (!dt) {
        return "";
    }
    const minutes = Math.max(0, Math.round(luxon.DateTime.local().diff(dt, "minutes").minutes));
    return minutes < 60 ? `${minutes}m` : hoursLabel(minutes / 60);
}

/**
 * Base of the Time Off / Attendance dashboards (Modern Time Off, Modern Attendances):
 * period + department filters, remembered per page, one server call.
 */
/** Shared: period + department filters, remembered per page, one server call. */
export class TimeDashboard extends Component {
    static components = { ...OD_COMPONENTS };
    static props = ["*"];
    static storeKey = "";
    static method = "";
    static appXmlid = "";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        usePinApp(this.constructor.appXmlid);
        let saved = {};
        try {
            saved = JSON.parse(window.localStorage.getItem(this.constructor.storeKey) || "{}") || {};
        } catch {
            saved = {};
        }
        this.state = useState({
            loading: true,
            busy: false,
            error: false,
            data: null,
            period: saved.period || "month",
            teamId: saved.teamId || false,
        });
        this.firstName = (user.name || "").split(" ")[0];
        this.greeting = greeting();
        this.number = number;
        this.count = (v) => number(Math.round(v || 0));
        this.days = (v) => `${number(Math.round((v || 0) * 10) / 10)} ${_t("days")}`;
        this.hours = hoursLabel;
        this.axis = (v) => number(Math.round(v || 0));
        onWillStart(() => this.load());
    }
    async load() {
        const data = await loadDashboard(this, () =>
            this.orm.call("hr.employee", this.constructor.method, [this.state.period, this.state.teamId || false])
        );
        if (data) {
            this.state.data = data;
        }
    }
    onFilters(change) {
        Object.assign(this.state, change);
        try {
            window.localStorage.setItem(
                this.constructor.storeKey,
                JSON.stringify({ period: this.state.period, teamId: this.state.teamId })
            );
        } catch {
            // private mode: the choice is simply not remembered
        }
        return this.load();
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
    get departments() {
        return this.state.data.department_list || [];
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    /** A record as Odoo's own full page (time off, allocation…). */
    openForm(resModel, resId = false, context = {}) {
        return openFullForm(this.action, resModel, resId, { context });
    }
    /** A simple record in the CRM-style drawer (attendance…); reloads the figures after. */
    openQuick(DrawerComponent, resId = false, context = {}) {
        return openQuickDrawer(this.dialog, DrawerComponent, { resId, context }).then(() => this.load());
    }
    openRecords(resModel, name, domain, views, context = {}) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: resModel,
            views,
            domain,
            context,
            target: "current",
        });
    }
    openAttention(item) {
        const views = item.model === "hr.attendance"
            ? [[false, "list"], [false, "form"]]
            : [[false, "list"], [false, "kanban"], [false, "form"]];
        return this.openRecords(item.model, item.label, [...this.scope(item.model), ...(item.domain || [])], views);
    }
    scope(model) {
        const d = this.state.teamId;
        if (!d) {
            return [];
        }
        return model === "hr.leave" ? [["department_id", "child_of", d]] : [["employee_id.department_id", "child_of", d]];
    }
}

