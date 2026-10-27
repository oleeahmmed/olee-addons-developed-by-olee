import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { ProjectDrawer, StageDrawer, TagDrawer, TaskDrawer } from "./drawer";

/**
 * Modern Project in the theme's sidebar (same arrangement as Modern CRM).
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says how
 * to arrange the Project app:
 *   sidebar  = Dashboard, Projects, My Tasks, All Tasks (everyday work)
 *   top bar  = More (overdue, unassigned, closed tasks), Odoo's Reporting and
 *              Configuration (used less)
 * Odoo's own Projects / Tasks entries are hidden: our pages show the same records with
 * the same views, filters and forms.
 */
const APP_XMLID = "project.menu_main_pm";
const SECONDARY = new Set([
    "project_modern.menu_more",
    "project.menu_project_report",
    "project.menu_project_config",
]);
const REPLACED = new Set([
    "project.menu_projects",
    "project.menu_projects_group_stage",
    "project.menu_project_management",
    "project.menu_project_config_project",
    "project.menu_project_tags_act",
]);
const ORDER = [
    "project_modern.menu_dashboard",
    "project_modern.menu_projects",
    "project_modern.menu_my_tasks",
    "project_modern.menu_all_tasks",
];

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). */
export const menuIcons = registry.category("project_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "project_modern.menu_dashboard": "fa-th-large",
    "project_modern.menu_projects": "fa-folder-open-o",
    "project_modern.menu_my_tasks": "fa-check-square-o",
    "project_modern.menu_all_tasks": "fa-tasks",
    "project_modern.menu_more": "fa-ellipsis-h",
    "project_modern.menu_overdue": "fa-calendar-times-o",
    "project_modern.menu_unassigned": "fa-user-times",
    "project_modern.menu_closed": "fa-archive",
    "project_modern.menu_stages": "fa-columns",
    "project_modern.menu_tags": "fa-tags",
    // Odoo's own Project menus
    "project.menu_project_report": "fa-bar-chart",
    "project.menu_project_report_task_analysis": "fa-bar-chart",
    "project.rating_rating_menu_project": "fa-smile-o",
    "project.menu_project_config": "fa-cog",
    "project.project_config_settings_menu_action": "fa-sliders",
    "project.menu_projects_config": "fa-folder-o",
    "project.menu_projects_config_group_stage": "fa-folder-o",
    "project.menu_project_config_project_stage": "fa-list-ol",
    "project.project_menu_config_project_roles": "fa-id-badge",
    "project.project_menu_config_activity_type": "fa-th",
    "project.mail_activity_plan_menu_config_project": "fa-list-ul",
})) {
    menuIcons.add(xmlid, icon);
}

/** What the sidebar's "+" creates on each page. */
export const createTargets = registry.category("project_modern.create_targets");
for (const [xmlid, spec] of Object.entries({
    "project_modern.menu_projects": { resModel: "project.project", label: _t("New project") },
    "project_modern.menu_my_tasks": { resModel: "project.task", label: _t("New task") },
    "project_modern.menu_all_tasks": { resModel: "project.task", label: _t("New task") },
    "project_modern.menu_dashboard": { resModel: "project.task", label: _t("New task") },
    "project_modern.menu_overdue": { resModel: "project.task", label: _t("New task") },
    "project_modern.menu_unassigned": { resModel: "project.task", label: _t("New task") },
    "project_modern.menu_stages": { resModel: "project.task.type", label: _t("New stage") },
    "project_modern.menu_tags": { resModel: "project.tags", label: _t("New tag") },
})) {
    createTargets.add(xmlid, spec);
}
const DRAWERS = {
    "project.task": TaskDrawer,
    "project.project": ProjectDrawer,
    "project.task.type": StageDrawer,
    "project.tags": TagDrawer,
};

async function onCreate(spec, env) {
    const Drawer = DRAWERS[spec.resModel];
    if (!Drawer) {
        return false;
    }
    env.services.dialog.add(Drawer, {
        context: spec.context || {},
        onSaved: () => env.bus.trigger("project_modern:reload"),
    });
    return true;
}

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "pm",
    ownPrefixes: ["project_modern."],
    mergeInto: {},
    replaced: REPLACED,
    secondary: SECONDARY,
    order: ORDER,
    icons: menuIcons,
    createTargets,
    defaultCreate: "project_modern.menu_my_tasks",
    onCreate,
});

// Counters next to menus (refreshed when the app opens, at most once a minute)
const CLOSED = ["1_done", "1_canceled"];
const nowUtc = () => luxon.DateTime.now().toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
const badges = registry.category("modern_theme.menu_badges");
// my open tasks that are late
badges.add("project_modern.menu_my_tasks", (env) =>
    env.services.orm.searchCount("project.task", [
        ["user_ids", "in", [user.userId]],
        ["state", "not in", CLOSED],
        ["date_deadline", "<", nowUtc()],
        ["is_template", "=", false],
    ])
);
badges.add("project_modern.menu_overdue", (env) =>
    env.services.orm.searchCount("project.task", [
        ["state", "not in", CLOSED],
        ["date_deadline", "<", nowUtc()],
        ["project_id", "!=", false],
        ["is_template", "=", false],
    ])
);
badges.add("project_modern.menu_unassigned", (env) =>
    env.services.orm.searchCount("project.task", [
        ["state", "not in", CLOSED],
        ["user_ids", "=", false],
        ["project_id", "!=", false],
        ["is_template", "=", false],
    ])
);

// Ctrl+K: search projects and tasks by name (read access checked by the palette)
const palette = registry.category("modern_theme.palette_models");
if (!palette.contains("project.project")) {
    palette.add("project.project", { label: _t("Project"), icon: "fa-folder-open-o", limit: 4 });
}
if (!palette.contains("project.task")) {
    palette.add("project.task", { label: _t("Task"), icon: "fa-tasks", limit: 5 });
}
