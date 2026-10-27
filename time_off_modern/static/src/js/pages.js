/** Modern Time Off pages: Odoo's own hr.leave / hr.leave.allocation views in the modern page. */
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { ListPage } from "@employee_modern/js/pages/list_pages";

function allowedCompanies() {
    return user.context.allowed_company_ids || user.activeCompanies?.map((c) => c.id) || [];
}

// ---------------------------------------------------------------- Time Off
class LeavePage extends ListPage {
    static appXmlid = "hr_holidays.menu_hr_holidays_root";
    static resModel = "hr.leave";
    static recordLabel = _t("Time Off");
    static icon = "fa-plane";
    static newLabel = _t("New time off");
    get domain() {
        return [["employee_company_id", "in", allowedCompanies()]];
    }
    get context() {
        // as Odoo's own manager action
        return { hide_employee_name: 1 };
    }
}

class TimeOffRequestsPage extends LeavePage {
    static title = _t("Time Off Requests");
    static prefix = "leave";
    static types = ["list", "calendar", "kanban", "activity", "pivot", "graph"];
    static emptyTitle = _t("No time off request");
    static emptyText = _t("Requests of your employees show up here: approve or refuse them right on the line, or see everyone's time off in the calendar.");
    get context() {
        // opens on what waits for a decision; remove the filter to see everything
        return { ...super.context, search_default_to_approve: 1 };
    }
}

class AllocationsPage extends ListPage {
    static appXmlid = "hr_holidays.menu_hr_holidays_root";
    static recordLabel = _t("Allocation");
    static title = _t("Allocations");
    static resModel = "hr.leave.allocation";
    static prefix = "alloc";
    static types = ["list", "kanban", "activity"];
    static icon = "fa-plus-square-o";
    static newLabel = _t("New allocation");
    static emptyTitle = _t("Create a new allocation");
    static emptyText = _t("Give employees their yearly days off, or approve the extra days they ask for.");
    get domain() {
        return [["employee_id.company_id", "in", allowedCompanies()]];
    }
}

const actions = registry.category("actions");
actions.add("time_off_modern.requests", TimeOffRequestsPage);
actions.add("time_off_modern.allocations", AllocationsPage);
