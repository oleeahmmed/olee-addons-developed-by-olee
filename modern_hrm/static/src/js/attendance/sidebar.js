import { registry } from "@web/core/registry";

/**
 * Odoo's Attendances app in the theme's sidebar.
 *   sidebar  = At Work, Attendances, Extra Hours
 *   top bar  = Kiosk Mode, Reporting, Configuration
 * Odoo's "Management" entry is replaced by these pages (same records, same views,
 * Odoo's own approve / refuse buttons for extra hours); Odoo's Overview stays.
 */
const icons = registry.category("modern_hrm.attendance_menu_icons");
for (const [xmlid, icon] of Object.entries({
    "modern_hrm.attendance_menu_at_work": "fa-sign-in",
    "modern_hrm.attendance_menu_attendances": "fa-list-ul",
    "modern_hrm.attendance_menu_extra_hours": "fa-bolt",
    "hr_attendance.menu_action_open_form": "fa-desktop",
    "hr_attendance.menu_hr_attendance_reporting": "fa-bar-chart",
    "hr_attendance.menu_hr_attendance_configuration": "fa-cog",
})) {
    icons.add(xmlid, icon);
}

const badges = registry.category("modern_theme.menu_badges");
badges.add("modern_hrm.attendance_menu_at_work", (env) =>
    env.services.orm.searchCount("hr.attendance", [["check_out", "=", false]])
);
badges.add("modern_hrm.attendance_menu_extra_hours", (env) =>
    env.services.orm.searchCount("hr.attendance", [["overtime_status", "=", "to_approve"], ["check_out", "!=", false]])
);

registry.category("modern_theme.sidebar_apps").add("hr_attendance.menu_hr_attendance_root", {
    legacyPrefix: "em",
    ownPrefixes: ["modern_hrm.attendance_"],
    mergeInto: {},
    replaced: new Set(["hr_attendance.menu_hr_attendance_view_attendances_management"]),
    secondary: new Set([
        "hr_attendance.menu_action_open_form",
        "hr_attendance.menu_hr_attendance_reporting",
        "hr_attendance.menu_hr_attendance_configuration",
    ]),
    order: [
        "modern_hrm.attendance_menu_at_work",
        "modern_hrm.attendance_menu_attendances",
        "modern_hrm.attendance_menu_extra_hours",
    ],
    icons,
});
