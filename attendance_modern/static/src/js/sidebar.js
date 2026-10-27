import { registry } from "@web/core/registry";

/**
 * Odoo's Attendances app in the theme's sidebar.
 *   sidebar  = Dashboard, At Work, Attendances, Extra Hours
 *   top bar  = Kiosk Mode, Reporting, Configuration
 * Odoo's "Overview" and "Management" entries are replaced by these pages (same records,
 * same views, Odoo's own approve / refuse buttons for extra hours).
 */
const icons = registry.category("attendance_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "attendance_modern.menu_dashboard": "fa-th-large",
    "attendance_modern.menu_at_work": "fa-sign-in",
    "attendance_modern.menu_attendances": "fa-list-ul",
    "attendance_modern.menu_extra_hours": "fa-bolt",
    "hr_attendance.menu_action_open_form": "fa-desktop",
    "hr_attendance.menu_hr_attendance_reporting": "fa-bar-chart",
    "hr_attendance.menu_hr_attendance_configuration": "fa-cog",
})) {
    icons.add(xmlid, icon);
}

const badges = registry.category("modern_theme.menu_badges");
badges.add("attendance_modern.menu_at_work", (env) =>
    env.services.orm.searchCount("hr.attendance", [["check_out", "=", false]])
);
badges.add("attendance_modern.menu_extra_hours", (env) =>
    env.services.orm.searchCount("hr.attendance", [["overtime_status", "=", "to_approve"], ["check_out", "!=", false]])
);

registry.category("modern_theme.sidebar_apps").add("hr_attendance.menu_hr_attendance_root", {
    legacyPrefix: "em",
    ownPrefixes: ["attendance_modern."],
    mergeInto: {},
    replaced: new Set(["hr_attendance.menu_hr_attendance_overview", "hr_attendance.menu_hr_attendance_view_attendances_management"]),
    secondary: new Set([
        "hr_attendance.menu_action_open_form",
        "hr_attendance.menu_hr_attendance_reporting",
        "hr_attendance.menu_hr_attendance_configuration",
    ]),
    order: [
        "attendance_modern.menu_dashboard",
        "attendance_modern.menu_at_work",
        "attendance_modern.menu_attendances",
        "attendance_modern.menu_extra_hours",
    ],
    icons,
});
