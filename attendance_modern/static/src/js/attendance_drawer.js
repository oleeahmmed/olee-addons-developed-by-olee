import { _t } from "@web/core/l10n/translation";
import { deserializeDateTime, serializeDateTime } from "@web/core/l10n/dates";
import { QuickDrawer } from "@employee_modern/js/drawer/record_drawer";
import { hoursLabel } from "@employee_modern/js/pages/time_base";

const INPUT = "yyyy-MM-dd'T'HH:mm";

/** server UTC "YYYY-MM-DD HH:MM:SS" → value of a datetime-local input (user's time) */
function toInput(value) {
    return value ? deserializeDateTime(value).toFormat(INPUT) : "";
}
/** datetime-local input → server UTC value */
function fromInput(value) {
    return value ? serializeDateTime(luxon.DateTime.fromFormat(value, INPUT)) : false;
}

/** Attendance: employee, check in, check out — in the CRM-style drawer. */
export class AttendanceDrawer extends QuickDrawer {
    static template = "attendance_modern.AttendanceDrawer";
    static resModel = "hr.attendance";
    static defaults = { employee_id: "", check_in: "", check_out: "" };

    emptyValues() {
        return { ...super.emptyValues(), check_in: luxon.DateTime.now().toFormat(INPUT), worked: null };
    }
    get title() {
        if (this.isEdit) {
            const emp = this.employeeOptions.find((e) => e.id == this.state.employee_id);
            return emp ? emp.title : _t("Attendance");
        }
        return _t("New attendance");
    }
    get subtitle() {
        if (this.isEdit && this.state.worked !== null) {
            return this.state.check_out
                ? _t("Worked %s.", hoursLabel(this.state.worked))
                : _t("Checked in, not checked out yet.");
        }
        return _t("When the employee arrived and left. Leave Check out empty while they are at work.");
    }
    get employeeOptions() {
        return (this.state.choices.employees || []).map((e) => ({
            id: e.id,
            title: e.name,
            hint: e.job_title || (e.department_id ? e.department_id[1] : ""),
        }));
    }
    get fieldNames() {
        return [...super.fieldNames, "worked_hours"];
    }
    async loadChoices() {
        const employees = await this.orm.searchRead("hr.employee", [], ["name", "job_title", "department_id"], { order: "name" });
        this.state.choices = { employees };
    }
    fromRecord(rec) {
        // the server values as loaded: written back untouched when the time was not changed
        this.loaded = { check_in: [toInput(rec.check_in), rec.check_in], check_out: [toInput(rec.check_out), rec.check_out] };
        return {
            employee_id: rec.employee_id ? rec.employee_id[0] : "",
            check_in: toInput(rec.check_in),
            check_out: toInput(rec.check_out),
            worked: rec.worked_hours || 0,
        };
    }
    validate() {
        if (!this.state.employee_id) {
            return _t("Pick the employee.");
        }
        if (!this.state.check_in) {
            return _t("Set the check in time.");
        }
        if (this.state.check_out && this.state.check_out < this.state.check_in) {
            return _t("Check out must be after check in.");
        }
        return null;
    }
    timeValue(name) {
        const loaded = this.isEdit && this.loaded?.[name];
        return loaded && loaded[0] === this.state[name] ? loaded[1] : fromInput(this.state[name]);
    }
    toValues() {
        return {
            employee_id: Number(this.state.employee_id),
            check_in: this.timeValue("check_in"),
            check_out: this.timeValue("check_out"),
        };
    }
}
