/** Modern Attendances pages: Odoo's own hr.attendance views in the modern page. */
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { ListPage } from "@employee_modern/js/pages/list_pages";
import { AttendanceDrawer } from "./attendance_drawer";

function allowedCompanies() {
    return user.context.allowed_company_ids || user.activeCompanies?.map((c) => c.id) || [];
}

// ---------------------------------------------------------------- Attendances
class AttendancePage extends ListPage {
    static appXmlid = "hr_attendance.menu_hr_attendance_root";
    static resModel = "hr.attendance";
    static recordLabel = _t("Attendance");
    static quickDrawer = AttendanceDrawer;
    static icon = "fa-clock-o";
    static newLabel = _t("New attendance");
    get domain() {
        return [["employee_id.company_id", "in", allowedCompanies()]];
    }
}

class AttendanceAllPage extends AttendancePage {
    static title = _t("Attendances");
    static prefix = "att";
    static types = ["list", "kanban", "pivot", "graph"];
    static emptyTitle = _t("No attendance yet");
    static emptyText = _t("Check-ins and check-outs from the kiosk, the systray or by hand, with the hours worked.");
}

class AtWorkPage extends AttendancePage {
    static title = _t("At Work");
    static prefix = "atwork";
    static types = ["kanban", "list"];
    static allowCreate = false;
    static emptyTitle = _t("Nobody is checked in");
    static emptyText = _t("Employees who checked in and have not checked out yet appear here.");
    get domain() {
        return [...super.domain, ["check_out", "=", false]];
    }
}

class ExtraHoursPage extends AttendancePage {
    static title = _t("Extra Hours");
    static prefix = "overtime";
    // approving extra hours needs Odoo's own form
    static quickDrawer = null;
    static types = ["list", "pivot"];
    static allowCreate = false;
    static emptyTitle = _t("No extra hours to approve");
    static emptyText = _t("Attendances with more hours than planned wait here for approval.");
    get domain() {
        return [...super.domain, ["check_out", "!=", false]];
    }
    get context() {
        return { search_default_to_approve: 1, search_default_activeemployees: 1 };
    }
}

const actions = registry.category("actions");
actions.add("attendance_modern.attendances", AttendanceAllPage);
actions.add("attendance_modern.at_work", AtWorkPage);
actions.add("attendance_modern.extra_hours", ExtraHoursPage);
