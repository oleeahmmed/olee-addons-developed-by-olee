import { onWillStart } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useBus } from "@web/core/utils/hooks";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";
import { usePinApp } from "./app_context";
import { ProjectDrawer, StageDrawer, TagDrawer, TaskDrawer, openQuickDrawer } from "./drawer";

export { openFullForm };

export const APP_XMLID = "project.menu_main_pm";
const VIEW_IDS = { model: "project.task", method: "project_modern_view_ids" };
const CLOSED = ["1_done", "1_canceled"];

/** View ids of this app's pages (fetched once per page load). */
export function loadViewIds(orm) {
    return kitLoadViewIds(orm, VIEW_IDS);
}

/** Open a project's task board (stage columns), as a page of this app. */
export function openBoard(action, projectId, name, options = {}) {
    return action.doAction(
        {
            type: "ir.actions.client",
            tag: "project_modern.board",
            name: name || _t("Tasks"),
            context: { active_id: projectId, default_project_id: projectId },
        },
        options
    );
}

/**
 * Pages of Modern Project: Odoo's own project views (search, filters, group by, pager,
 * export, view switcher, stage columns, drag and drop) in the shared modern page of
 * modern_theme, with the CRM-style cards. Tasks open as Odoo's own full page; simple
 * records (new task, new project, stage, tag) in the CRM drawer.
 */
export class ListPage extends KitListPage {
    static cssPrefix = "pm";
    static storagePrefix = "project_modern";
    static viewIds = VIEW_IDS;
    static appXmlid = APP_XMLID;
    /** CRM-style drawer for this page's records (open and new), or null for Odoo's full page. */
    static quickDrawer = null;
    /** Drawer used by "New" only (existing records open as Odoo's full page). */
    static createDrawer = null;

    setup() {
        super.setup();
        usePinApp(this.constructor.appXmlid);
        useBus(this.env.bus, "project_modern:reload", () => this.refresh());
    }
    drawer(Drawer, resId = false, extra = {}) {
        return openQuickDrawer(this.dialog, Drawer, {
            resId: resId || false,
            context: this.context || {},
            ...extra,
        }).then(() => this.refresh());
    }
    open(resId) {
        const C = this.constructor;
        return C.quickDrawer ? this.drawer(C.quickDrawer, resId) : super.open(resId);
    }
    create() {
        const C = this.constructor;
        const Drawer = C.quickDrawer || C.createDrawer;
        return Drawer ? this.drawer(Drawer, false) : super.create();
    }
}

// ------------------------------------------------------------------ projects
class ProjectsPage extends ListPage {
    static title = _t("Projects");
    static resModel = "project.project";
    static prefix = "project";
    static types = ["kanban", "list", "calendar", "activity"];
    static icon = "fa-folder-open-o";
    static newLabel = _t("New project");
    static emptyTitle = _t("Create your first project");
    static emptyText = _t("Projects hold your tasks, organised in stages you can drag them through.");
    get domain() {
        return [["is_template", "=", false]];
    }
    get context() {
        return { display_milestone_deadline: true };
    }
    async open(resId) {
        const [rec] = await this.orm.read("project.project", [resId], ["display_name"]);
        return openBoard(this.action, resId, rec?.display_name);
    }
    create() {
        let created = false;
        return openQuickDrawer(this.dialog, ProjectDrawer, { onSaved: (id) => (created = id) }).then(async () => {
            if (created) {
                const [rec] = await this.orm.read("project.project", [created], ["display_name"]);
                return openBoard(this.action, created, rec?.display_name);
            }
            this.refresh();
        });
    }
}

// ------------------------------------------------------------------ tasks
class TaskPage extends ListPage {
    static resModel = "project.task";
    static icon = "fa-tasks";
    static newLabel = _t("New task");
    static createDrawer = TaskDrawer;
    static types = ["kanban", "list", "calendar", "pivot", "graph", "activity"];
    get domain() {
        return [["has_template_ancestor", "=", false], ["has_project_template", "=", false]];
    }
    get context() {
        return { search_default_open_tasks: 1 };
    }
}

/** One project's board: a column per stage, drag a card to move it. */
class BoardPage extends TaskPage {
    static title = _t("Tasks");
    static prefix = "board";
    static emptyTitle = _t("No task in this project yet");
    static emptyText = _t("Add a task, or a stage to start the board.");

    setup() {
        super.setup();
        this.projectId = Number(this.ctx.active_id || this.ctx.default_project_id) || false;
        this.projectName = this.props.action?.name || "";
        onWillStart(async () => {
            if (!this.projectId) {
                // opened without a project (old link): go back to the projects
                this.action.doAction("project_modern.action_projects", { stackPosition: "replaceCurrentAction" });
                return;
            }
            const [rec] = await this.orm.read("project.project", [this.projectId], ["display_name"]).catch(() => []);
            if (rec) {
                this.projectName = rec.display_name;
            }
        });
    }
    /** the project's name ("Office Design"), in the title and the breadcrumbs */
    get pageTitle() {
        return this.projectName || this.constructor.title;
    }
    get domain() {
        return [...super.domain, ["project_id", "=", this.projectId]];
    }
    get context() {
        return {
            ...super.context,
            active_id: this.projectId,
            default_project_id: this.projectId,
            show_project_update: true,
            display_milestone_deadline: true,
        };
    }
}

class MyTasksPage extends TaskPage {
    static title = _t("My Tasks");
    static prefix = "mytask";
    static emptyTitle = _t("No task for you");
    static emptyText = _t("Tasks you are assigned to show up here, in your own stages: Inbox, Today, This Week…");
    get domain() {
        return [...super.domain, ["user_ids", "in", [user.userId]]];
    }
    get context() {
        return { ...super.context, my_tasks: 1, default_user_ids: [[4, user.userId]] };
    }
}

class AllTasksPage extends TaskPage {
    static title = _t("All Tasks");
    static prefix = "alltask";
    static types = ["list", "kanban", "calendar", "pivot", "graph", "activity"];
    static emptyTitle = _t("No task yet");
    static emptyText = _t("Every task of every project you can see, one column per project.");
}

class OverduePage extends TaskPage {
    static title = _t("Overdue Tasks");
    static prefix = "overdue";
    static types = ["list", "kanban", "calendar"];
    static emptyTitle = _t("Nothing is late");
    static emptyText = _t("Open tasks whose deadline has passed appear here.");
    get domain() {
        return [
            ...super.domain,
            ["state", "not in", CLOSED],
            ["date_deadline", "<", luxon.DateTime.now().startOf("day").toUTC().toFormat("yyyy-MM-dd HH:mm:ss")],
        ];
    }
    get context() {
        return {};
    }
}

class UnassignedPage extends TaskPage {
    static title = _t("Unassigned Tasks");
    static prefix = "unassigned";
    static types = ["list", "kanban"];
    static emptyTitle = _t("Every task has someone on it");
    static emptyText = _t("Open tasks nobody is assigned to appear here.");
    get domain() {
        return [...super.domain, ["state", "not in", CLOSED], ["user_ids", "=", false]];
    }
    get context() {
        return { project_modern_no_me: true };
    }
}

class ClosedTasksPage extends TaskPage {
    static title = _t("Closed Tasks");
    static prefix = "closed";
    static types = ["list", "kanban", "pivot", "graph"];
    static createDrawer = null;
    static allowCreate = false;
    static emptyTitle = _t("No closed task yet");
    static emptyText = _t("Tasks marked Done or Cancelled are kept here.");
    get domain() {
        return [...super.domain, ["state", "in", CLOSED]];
    }
    get context() {
        return {};
    }
}

// ------------------------------------------------------------------ configuration
class StagesPage extends ListPage {
    static title = _t("Task Stages");
    static resModel = "project.task.type";
    static prefix = "stage";
    static types = ["list", "kanban"];
    static icon = "fa-columns";
    static newLabel = _t("New stage");
    static quickDrawer = StageDrawer;
    static emptyTitle = _t("Create a stage");
    static emptyText = _t("Stages are the columns of the task boards: To Do, In Progress, Done…");
    get domain() {
        return [["user_id", "=", false]];
    }
    get context() {
        return { default_user_id: false };
    }
}

class TagsPage extends ListPage {
    static title = _t("Tags");
    static resModel = "project.tags";
    static prefix = "tag";
    static types = ["list"];
    static icon = "fa-tags";
    static newLabel = _t("New tag");
    static quickDrawer = TagDrawer;
    static emptyTitle = _t("Create a tag");
    static emptyText = _t("Tags label tasks and projects so you can filter and group them.");
}

const actions = registry.category("actions");
actions.add("project_modern.projects", ProjectsPage);
actions.add("project_modern.board", BoardPage);
actions.add("project_modern.my_tasks", MyTasksPage);
actions.add("project_modern.all_tasks", AllTasksPage);
actions.add("project_modern.overdue", OverduePage);
actions.add("project_modern.unassigned", UnassignedPage);
actions.add("project_modern.closed", ClosedTasksPage);
actions.add("project_modern.stages", StagesPage);
actions.add("project_modern.tags", TagsPage);
