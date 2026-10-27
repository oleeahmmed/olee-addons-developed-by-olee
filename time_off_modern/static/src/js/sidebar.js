import { registry } from "@web/core/registry";

/**
 * Odoo's Time Off app in the theme's sidebar.
 *   sidebar  = Dashboard, Requests, Allocations, Team Calendar (people who approve)
 *   top bar  = My Time, Reporting, Configuration
 * Employees who do not approve time off only have Odoo's own "My Time" and the Team
 * Calendar, and keep them in the sidebar. Odoo's "Management" and "Overview" entries are
 * replaced by Requests / Allocations / Team Calendar (same records, same views).
 */
const icons = registry.category("time_off_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "time_off_modern.menu_dashboard": "fa-th-large",
    "time_off_modern.menu_requests": "fa-inbox",
    "time_off_modern.menu_allocations": "fa-plus-square-o",
    "time_off_modern.menu_team_calendar": "fa-calendar",
    "hr_holidays.menu_hr_holidays_my_leaves": "fa-user",
    "hr_holidays.hr_leave_menu_new_request": "fa-th-large",
    "hr_holidays.hr_leave_menu_my": "fa-plane",
    "hr_holidays.menu_open_allocation": "fa-plus-square-o",
    "hr_holidays.menu_hr_holidays_report": "fa-bar-chart",
    "hr_holidays.menu_hr_holidays_configuration": "fa-cog",
})) {
    icons.add(xmlid, icon);
}

const pending = ["state", "in", ["confirm", "validate1"]];
const badges = registry.category("modern_theme.menu_badges");
badges.add("time_off_modern.menu_requests", (env) => env.services.orm.searchCount("hr.leave", [pending]));
badges.add("time_off_modern.menu_allocations", (env) => env.services.orm.searchCount("hr.leave.allocation", [pending]));

registry.category("modern_theme.sidebar_apps").add("hr_holidays.menu_hr_holidays_root", {
    legacyPrefix: "em",
    ownPrefixes: ["time_off_modern."],
    mergeInto: {},
    replaced: new Set(["hr_holidays.menu_hr_holidays_dashboard", "hr_holidays.menu_hr_holidays_management"]),
    secondary: new Set(["hr_holidays.menu_hr_holidays_report", "hr_holidays.menu_hr_holidays_configuration"]),
    order: [
        "time_off_modern.menu_dashboard",
        "time_off_modern.menu_requests",
        "time_off_modern.menu_allocations",
        "time_off_modern.menu_team_calendar",
        "hr_holidays.menu_hr_holidays_my_leaves",
    ],
    icons,
});
