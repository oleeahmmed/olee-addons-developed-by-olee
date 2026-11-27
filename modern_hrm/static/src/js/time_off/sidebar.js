import { registry } from "@web/core/registry";

/**
 * Odoo's Time Off app in the theme's sidebar.
 *   sidebar  = Requests, Allocations, Team Calendar (people who approve)
 *   top bar  = My Time, Reporting, Configuration
 * Employees who do not approve time off only have Odoo's own "My Time" and the Team
 * Calendar, and keep them in the sidebar. Odoo's "Management" entry is replaced by
 * Requests / Allocations (same records, same views); Odoo's Overview stays.
 */
const icons = registry.category("modern_hrm.time_off_menu_icons");
for (const [xmlid, icon] of Object.entries({
    "modern_hrm.time_off_menu_requests": "fa-inbox",
    "modern_hrm.time_off_menu_allocations": "fa-plus-square-o",
    "modern_hrm.time_off_menu_team_calendar": "fa-calendar",
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
badges.add("modern_hrm.time_off_menu_requests", (env) => env.services.orm.searchCount("hr.leave", [pending]));
badges.add("modern_hrm.time_off_menu_allocations", (env) => env.services.orm.searchCount("hr.leave.allocation", [pending]));

registry.category("modern_theme.sidebar_apps").add("hr_holidays.menu_hr_holidays_root", {
    legacyPrefix: "em",
    ownPrefixes: ["modern_hrm.time_off_"],
    mergeInto: {},
    replaced: new Set(["hr_holidays.menu_hr_holidays_management"]),
    secondary: new Set(["hr_holidays.menu_hr_holidays_report", "hr_holidays.menu_hr_holidays_configuration"]),
    order: [
        "modern_hrm.time_off_menu_requests",
        "modern_hrm.time_off_menu_allocations",
        "modern_hrm.time_off_menu_team_calendar",
        "hr_holidays.menu_hr_holidays_my_leaves",
    ],
    icons,
});
