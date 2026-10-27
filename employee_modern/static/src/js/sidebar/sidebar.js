import { registry } from "@web/core/registry";

/**
 * Modern Employees in the theme's sidebar.
 *
 * Modern Theme draws one sidebar for every app from Odoo's own menus (so groups,
 * settings and installed modules always decide what is shown). This file only says how
 * to arrange the Employees app:
 *   sidebar  = Dashboard, Employees, Departments (everyday work)
 *   top bar  = Records (new hires, contracts ending, former employees, job positions,
 *              history), Odoo's Reporting and Configuration (used less)
 * Odoo's own Employees / Departments entries are hidden: our pages show the same records
 * with the same views and forms. Time Off and Attendances keep their own apps
 * (Modern Time Off / Modern Attendances).
 */
const APP_XMLID = "hr.menu_hr_root";
const SECONDARY = new Set([
    "employee_modern.menu_records",
    "hr.hr_menu_hr_reports",
    "hr.menu_human_resources_configuration",
]);
const REPLACED = new Set(["hr.menu_hr_employee_payroll", "hr.menu_hr_department_kanban"]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("employee_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "employee_modern.menu_dashboard": "fa-th-large",
    "employee_modern.menu_employees": "fa-users",
    "employee_modern.menu_departments": "fa-sitemap",
    "employee_modern.menu_records": "fa-folder-open-o",
    "employee_modern.menu_new_hires": "fa-user-plus",
    "employee_modern.menu_contracts_ending": "fa-hourglass-half",
    "employee_modern.menu_former": "fa-user-times",
    "employee_modern.menu_jobs": "fa-briefcase",
    "employee_modern.menu_history": "fa-history",
    // Odoo's own Employees menus
    "hr.menu_hr_employee": "fa-address-book-o",
    "hr.menu_hr_main": "fa-users",
    "hr.hr_menu_hr_reports": "fa-bar-chart",
    "hr.menu_human_resources_configuration": "fa-cog",
    "hr.menu_config_employee": "fa-id-card-o",
    "hr.menu_config_plan_plan": "fa-list-ol",
    "hr.menu_hr_work_location_tree": "fa-map-marker",
    "hr.menu_resource_calendar_view": "fa-calendar",
    "hr.menu_hr_departure_reason_tree": "fa-sign-out",
    "hr.menu_view_employee_category_form": "fa-tags",
    "hr.menu_config_recruitment": "fa-user-plus",
    "hr.menu_view_hr_job": "fa-briefcase",
    "hr.menu_hr_employee_contract_templates": "fa-file-text-o",
    "hr.menu_view_hr_contract_type": "fa-file-o",
})) {
    menuIcons.add(xmlid, icon);
}

/** Counters next to menus (refreshed when the app opens, at most once a minute). */
const badges = registry.category("modern_theme.menu_badges");
badges.add("employee_modern.menu_contracts_ending", (env) => {
    const today = luxon.DateTime.now();
    return env.services.orm.searchCount("hr.employee", [
        ["contract_date_end", ">=", today.toISODate()],
        ["contract_date_end", "<=", today.plus({ days: 30 }).toISODate()],
    ]);
});
badges.add("employee_modern.menu_new_hires", (env) =>
    env.services.orm.searchCount("hr.employee", [["newly_hired", "in", [true]]])
);

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "em",
    ownPrefixes: ["employee_modern."],
    mergeInto: {},
    replaced: REPLACED,
    secondary: SECONDARY,
    order: ["employee_modern.menu_dashboard", "employee_modern.menu_employees", "employee_modern.menu_departments", "employee_modern.menu_records"],
    icons: menuIcons,
});

// Ctrl+K: search employees and departments by name (read access checked by the palette)
const palette = registry.category("modern_theme.palette_models");
if (!palette.contains("hr.employee")) {
    palette.add("hr.employee", { label: "Employee", icon: "fa-id-badge" });
}
if (!palette.contains("hr.department")) {
    palette.add("hr.department", { label: "Department", icon: "fa-sitemap" });
}
