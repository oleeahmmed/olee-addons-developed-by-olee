import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";
import { DepartmentDrawer, JobDrawer, openQuickDrawer } from "../drawer/record_drawer";
import { usePinApp } from "./app_context";

export { openFullForm, openQuickDrawer };

const VIEW_IDS = { model: "hr.employee", method: "employee_modern_view_ids" };
/** View ids of this app's pages (fetched once per page load). */
export function loadViewIds(orm) {
    return kitLoadViewIds(orm, VIEW_IDS);
}

/** The companies selected in the company switcher, as Odoo's own Employees action does. */
function allowedCompanies() {
    return user.context.allowed_company_ids || user.activeCompanies?.map((c) => c.id) || [];
}
function isoDay(offset = 0) {
    return luxon.DateTime.now().plus({ days: offset }).toISODate();
}

/**
 * Pages of Modern Employees: Odoo's own HR views (search, filters, group by, pager,
 * export, view switcher, kanban avatars, activities) in the shared modern page of
 * modern_theme. Adding, viewing and editing use Odoo's own forms, with the chatter.
 */
export class ListPage extends KitListPage {
    static cssPrefix = "em";
    static storagePrefix = "employee_modern";
    static viewIds = VIEW_IDS;
    /** App whose menus the sidebar and top bar show on this page. */
    static appXmlid = "hr.menu_hr_root";
    /** Name of one record ("Employee", "Time Off"…). */
    static recordLabel = "";

    setup() {
        super.setup();
        usePinApp(this.constructor.appXmlid);
    }
    /**
     * Simple records (department, job position, attendance) open in the CRM-style
     * drawer given here; every other record opens as Odoo's own full page.
     */
    static quickDrawer = null;

    openQuick(resId) {
        const C = this.constructor;
        return openQuickDrawer(this.dialog, C.quickDrawer, { resId: resId || false, context: this.context || {} }).then(() =>
            this.refresh()
        );
    }
    open(resId) {
        return this.constructor.quickDrawer ? this.openQuick(resId) : super.open(resId);
    }
    create() {
        return this.constructor.quickDrawer ? this.openQuick(false) : super.create();
    }
}

class EmployeePage extends ListPage {
    static resModel = "hr.employee";
    static recordLabel = _t("Employee");
    static types = ["kanban", "list", "activity", "graph", "pivot"];
    static icon = "fa-id-badge";
    static newLabel = _t("New employee");
    get domain() {
        return [["company_id", "in", allowedCompanies()]];
    }
    get context() {
        // as Odoo's own Employees action: chat icon on the cards
        return { chat_icon: true };
    }
}

class EmployeesPage extends EmployeePage {
    static title = _t("Employees");
    static prefix = "employee";
    static emptyTitle = _t("Add your first employee");
    static emptyText = _t("Everyone who works for you: their job, department, manager, contract and documents, in one place.");
}

class NewHiresPage extends EmployeePage {
    static title = _t("New Hires");
    static prefix = "newhire";
    static emptyTitle = _t("No new hire in the last 90 days");
    static emptyText = _t("Employees whose contract started recently appear here, so their onboarding is easy to follow.");
    get context() {
        return { ...super.context, search_default_newly_hired: 1 };
    }
}

class ContractsEndingPage extends EmployeePage {
    static title = _t("Contracts Ending");
    static prefix = "ending";
    static types = ["list", "kanban", "activity"];
    static allowCreate = false;
    static emptyTitle = _t("No contract ends in the next 30 days");
    static emptyText = _t("Employees whose contract ends within a month show up here, so renewals are never missed.");
    get domain() {
        return [...super.domain, ["contract_date_end", ">=", isoDay()], ["contract_date_end", "<=", isoDay(30)]];
    }
}

class FormerPage extends EmployeePage {
    static title = _t("Former Employees");
    static prefix = "former";
    static types = ["list", "kanban"];
    static allowCreate = false;
    static emptyTitle = _t("No former employee");
    static emptyText = _t("Employees who left (archived with a departure reason) are kept here with their history.");
    get domain() {
        return [...super.domain, ["active", "=", false]];
    }
    get context() {
        return { ...super.context, active_test: false };
    }
}

class DepartmentsPage extends ListPage {
    static title = _t("Departments");
    static resModel = "hr.department";
    static recordLabel = _t("Department");
    static quickDrawer = DepartmentDrawer;
    static prefix = "department";
    static types = ["kanban", "list"];
    static icon = "fa-sitemap";
    static newLabel = _t("New department");
    static emptyTitle = _t("Create a new department");
    static emptyText = _t("Structure your employees per department to see headcount, managers and plans at a glance.");
    get domain() {
        return [["has_read_access", "=", true]];
    }
}

class JobsPage extends ListPage {
    static title = _t("Job Positions");
    static resModel = "hr.job";
    static recordLabel = _t("Job Position");
    static quickDrawer = JobDrawer;
    static prefix = "job";
    static types = ["list", "kanban"];
    static icon = "fa-briefcase";
    static newLabel = _t("New job position");
    static emptyTitle = _t("Create your first job position");
    static emptyText = _t("Job positions describe the roles in your company and who holds them.");
}

class RecordsPage extends ListPage {
    static title = _t("Employee Records");
    static resModel = "hr.version";
    static prefix = "record";
    static types = ["list", "pivot", "graph"];
    static icon = "fa-history";
    static allowCreate = false;
    static emptyTitle = _t("No employee record yet");
    static emptyText = _t("Every change of contract, job or wage is kept as a record of the employee's history.");
    get domain() {
        return [["employee_id", "!=", false]];
    }
    open(resId) {
        // a record belongs to an employee: open the employee (its versions are in the form)
        return this.orm.read("hr.version", [resId], ["employee_id"]).then(([rec]) =>
            rec?.employee_id ? openFullForm(this.action, "hr.employee", rec.employee_id[0]) : undefined
        );
    }
}

const actions = registry.category("actions");
actions.add("employee_modern.employees", EmployeesPage);
actions.add("employee_modern.new_hires", NewHiresPage);
actions.add("employee_modern.contracts_ending", ContractsEndingPage);
actions.add("employee_modern.former", FormerPage);
actions.add("employee_modern.departments", DepartmentsPage);
actions.add("employee_modern.jobs", JobsPage);
actions.add("employee_modern.records", RecordsPage);
