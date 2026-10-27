import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { shortDate } from "@modern_theme/js/app_kit/utils";
import { LEAVE_STATE, TimeDashboard } from "@employee_modern/js/pages/time_base";

// ---------------------------------------------------------------- Time Off
export class TimeOffDashboard extends TimeDashboard {
    static template = "time_off_modern.Dashboard";
    static storeKey = "time_off_modern.dashboard";
    static method = "employee_modern_timeoff_dashboard";
    static appXmlid = "hr_holidays.menu_hr_holidays_root";

    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get outFeed() {
        return this.state.data.out_list.map((l) => ({
            id: l.id,
            employee: l.employee_id && l.employee_id[0],
            name: l.employee_id ? l.employee_id[1] : "",
            text: l.holiday_status_id ? l.holiday_status_id[1] : "",
            time: `${_t("until")} ${shortDate(l.request_date_to)}`,
            avatar: l.employee_id ? `/web/image/hr.employee/${l.employee_id[0]}/avatar_128` : undefined,
        }));
    }
    get upcomingFeed() {
        return this.state.data.upcoming_list.map((l) => ({
            id: l.id,
            name: l.employee_id ? l.employee_id[1] : "",
            text: `${l.holiday_status_id ? l.holiday_status_id[1] : ""} · ${l.duration_display || this.days(l.number_of_days)}`,
            time: shortDate(l.request_date_from),
            avatar: l.employee_id ? `/web/image/hr.employee/${l.employee_id[0]}/avatar_128` : undefined,
        }));
    }
    get leaveColumns() {
        return [
            { key: "name", label: _t("Employee"), type: "person" },
            { key: "type", label: _t("Type") },
            { key: "dates", label: _t("Dates"), type: "muted" },
            { key: "duration", label: _t("Duration"), align: "end" },
            { key: "status", label: _t("Status"), type: "badge", align: "end" },
        ];
    }
    get leaveRows() {
        return this.state.data.pending.map((l) => {
            const [label, tone] = LEAVE_STATE[l.state] || [l.state, "slate"];
            const from = shortDate(l.request_date_from);
            const to = shortDate(l.request_date_to);
            return {
                id: l.id,
                name: l.employee_id ? l.employee_id[1] : "",
                name_sub: l.department_id ? l.department_id[1] : "",
                name_avatar: l.employee_id ? `/web/image/hr.employee/${l.employee_id[0]}/avatar_128` : "",
                type: l.holiday_status_id ? l.holiday_status_id[1] : "",
                dates: from === to ? from : `${from} → ${to}`,
                duration: l.duration_display || this.days(l.number_of_days),
                status: label,
                status_tone: tone,
            };
        });
    }
    newTimeOff() {
        return this.openForm("hr.leave");
    }
    openLeave(item) {
        return this.openForm("hr.leave", item.id);
    }
    openTeamCalendar() {
        // Odoo's own Time Off overview (everyone's time off on one calendar)
        return this.go("hr_holidays.action_hr_holidays_dashboard").catch(() => this.go("time_off_modern.action_requests"));
    }
    openOutToday() {
        const ids = this.state.data.out_list.map((l) => l.id);
        return this.openRecords("hr.leave", _t("Out today"), [["id", "in", ids]], [[false, "list"], [false, "form"]]);
    }
    openTaken() {
        const [start] = this.state.data.range;
        return this.openRecords(
            "hr.leave",
            _t("Time off taken"),
            [...this.scope("hr.leave"), ["state", "=", "validate"], ["request_date_from", ">=", start]],
            [[false, "list"], [false, "calendar"], [false, "form"]]
        );
    }
    openType(item) {
        const [start] = this.state.data.range;
        return this.openRecords(
            "hr.leave",
            item.label,
            [...this.scope("hr.leave"), ["state", "=", "validate"], ["holiday_status_id", "=", item.id], ["request_date_from", ">=", start]],
            [[false, "list"], [false, "form"]]
        );
    }
    openDepartment(item) {
        const [start] = this.state.data.range;
        return this.openRecords(
            "hr.leave",
            item.label,
            [["state", "=", "validate"], ["department_id", "child_of", item.id], ["request_date_from", ">=", start]],
            [[false, "list"], [false, "form"]]
        );
    }
}

registry.category("actions").add("time_off_modern.dashboard", TimeOffDashboard);
