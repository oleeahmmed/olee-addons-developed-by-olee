import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { dayStart } from "@modern_theme/js/app_kit/dash_kit";
import { OVERTIME_STATE, TimeDashboard, hoursLabel, sinceLabel, timeLabel } from "@employee_modern/js/pages/time_base";
import { AttendanceDrawer } from "./attendance_drawer";

// ---------------------------------------------------------------- Attendances
export class AttendanceDashboard extends TimeDashboard {
    static template = "attendance_modern.Dashboard";
    static storeKey = "attendance_modern.dashboard";
    static method = "attendance_modern_dashboard";
    static appXmlid = "hr_attendance.menu_hr_attendance_root";

    get total14() {
        return this.state.data.days.reduce((s, d) => s + d.value, 0);
    }
    get presence() {
        const k = this.k;
        return [
            { key: "at_work", label: _t("At work now"), count: this.count(k.at_work), tone: "teal", icon: "fa-sign-in" },
            { key: "checked", label: _t("Checked in today"), count: this.count(k.checked_today), tone: "blue", icon: "fa-check" },
            { key: "absent", label: _t("Not checked in today"), count: this.count(k.not_checked), tone: "amber", icon: "fa-user-times",
              sub: `${_t("of")} ${this.count(k.headcount)} ${_t("employees")}` },
            { key: "overtime", label: _t("Extra hours to approve"), count: this.count(k.overtime_to_approve), tone: "violet", icon: "fa-bolt" },
        ];
    }
    get atWorkFeed() {
        return this.state.data.at_work_list.map((a) => ({
            id: a.id,
            name: a.employee_id ? a.employee_id[1] : "",
            text: `${_t("since")} ${timeLabel(a.check_in)}${a.department ? " · " + a.department : ""}`,
            time: sinceLabel(a.check_in),
            avatar: a.employee_id ? `/web/image/hr.employee/${a.employee_id[0]}/avatar_128` : undefined,
        }));
    }
    get attendanceColumns() {
        return [
            { key: "name", label: _t("Employee"), type: "person" },
            { key: "in", label: _t("Check in"), type: "muted" },
            { key: "out", label: _t("Check out"), type: "muted" },
            { key: "worked", label: _t("Worked"), align: "end" },
            { key: "extra", label: _t("Extra hours"), type: "badge", align: "end" },
        ];
    }
    get attendanceRows() {
        return this.state.data.recent.map((a) => {
            const [label, tone] = a.overtime_hours > 0 ? OVERTIME_STATE[a.overtime_status] || ["", "slate"] : ["", "slate"];
            return {
                id: a.id,
                name: a.employee_id ? a.employee_id[1] : "",
                name_sub: a.department || "",
                name_avatar: a.employee_id ? `/web/image/hr.employee/${a.employee_id[0]}/avatar_128` : "",
                in: timeLabel(a.check_in),
                out: a.check_out ? timeLabel(a.check_out) : _t("At work"),
                worked: a.check_out ? hoursLabel(a.worked_hours) : sinceLabel(a.check_in),
                extra: a.overtime_hours > 0 ? `${hoursLabel(a.overtime_hours)} · ${label}` : "—",
                extra_tone: a.overtime_hours > 0 ? tone : "slate",
            };
        });
    }
    newAttendance() {
        return this.openQuick(AttendanceDrawer);
    }
    openAttendance(item) {
        return this.openQuick(AttendanceDrawer, item.id);
    }
    openPresence(item) {
        switch (item.key) {
            case "at_work":
                return this.go("attendance_modern.action_at_work");
            case "overtime":
                return this.go("attendance_modern.action_extra_hours");
            case "checked":
                return this.openRecords(
                    "hr.attendance",
                    item.label,
                    [...this.scope("hr.attendance"), ["check_in", ">=", dayStart(this.state.data.today)]],
                    [[false, "list"], [false, "form"]]
                );
            case "absent":
                return this.openRecords(
                    "hr.employee",
                    item.label,
                    [
                        ...(this.state.teamId ? [["department_id", "child_of", this.state.teamId]] : []),
                        "|", ["last_check_in", "=", false], ["last_check_in", "<", dayStart(this.state.data.today)],
                    ],
                    [[false, "kanban"], [false, "list"], [false, "form"]]
                );
        }
    }
    openDepartment(item) {
        const [start] = this.state.data.range;
        const domain = item.id ? [["employee_id.department_id", "child_of", item.id]] : [["employee_id.department_id", "=", false]];
        return this.openRecords(
            "hr.attendance",
            item.label,
            [...domain, ["check_in", ">=", dayStart(start)]],
            [[false, "list"], [false, "pivot"], [false, "form"]]
        );
    }
    openEmployeeOvertime(item) {
        return this.openRecords(
            "hr.attendance",
            item.label,
            [["employee_id", "=", item.id], ["overtime_hours", ">", 0]],
            [[false, "list"], [false, "form"]]
        );
    }
}

registry.category("actions").add("attendance_modern.dashboard", AttendanceDashboard);
