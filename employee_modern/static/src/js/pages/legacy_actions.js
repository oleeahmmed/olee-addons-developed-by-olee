import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

/**
 * Page tags of earlier versions (the addons were called hr_modern, hr_modern_holidays and
 * hr_modern_attendance, and Time Off / Attendances once lived inside Employees). A
 * database whose menus still point to them (files updated, module not upgraded yet)
 * opens the new page instead of failing with "Cannot find key … in the actions registry".
 */
const MOVED = {
    // hr_modern (Employees)
    "hr_modern.dashboard": "employee_modern.action_dashboard",
    "hr_modern.employees": "employee_modern.action_employees",
    "hr_modern.departments": "employee_modern.action_departments",
    "hr_modern.jobs": "employee_modern.action_jobs",
    "hr_modern.new_hires": "employee_modern.action_new_hires",
    "hr_modern.contracts_ending": "employee_modern.action_contracts_ending",
    "hr_modern.former": "employee_modern.action_former",
    "hr_modern.records": "employee_modern.action_records",
    // Time Off, first inside Employees, then hr_modern_holidays
    "hr_modern.timeoff_dashboard": "time_off_modern.action_dashboard",
    "hr_modern.timeoff_approve": "time_off_modern.action_requests",
    "hr_modern.timeoff_all": "time_off_modern.action_requests",
    "hr_modern.timeoff_requests": "time_off_modern.action_requests",
    "hr_modern.timeoff_allocations": "time_off_modern.action_allocations",
    "hr_modern_holidays.dashboard": "time_off_modern.action_dashboard",
    "hr_modern_holidays.requests": "time_off_modern.action_requests",
    "hr_modern_holidays.allocations": "time_off_modern.action_allocations",
    // Attendances, first inside Employees, then hr_modern_attendance
    "hr_modern.attendance_dashboard": "attendance_modern.action_dashboard",
    "hr_modern.attendance_all": "attendance_modern.action_attendances",
    "hr_modern.attendance_at_work": "attendance_modern.action_at_work",
    "hr_modern.attendance_overtime": "attendance_modern.action_extra_hours",
    "hr_modern_attendance.dashboard": "attendance_modern.action_dashboard",
    "hr_modern_attendance.attendances": "attendance_modern.action_attendances",
    "hr_modern_attendance.at_work": "attendance_modern.action_at_work",
    "hr_modern_attendance.extra_hours": "attendance_modern.action_extra_hours",
};

const actions = registry.category("actions");
for (const [tag, xmlid] of Object.entries(MOVED)) {
    if (actions.contains(tag)) {
        continue;
    }
    actions.add(tag, async (env) => {
        const options = { stackPosition: "replaceCurrentAction" };
        try {
            return await env.services.action.doAction(xmlid, options);
        } catch {
            env.services.notification.add(
                _t("This page moved. Upgrade Modern Employees (and Modern Time Off / Modern Attendances) from Apps."),
                { type: "warning", sticky: false }
            );
            return env.services.action.doAction("employee_modern.action_dashboard", options);
        }
    });
}

// Configuration shortcut of an earlier version: opens Odoo's own action by xml id.
if (!actions.contains("hr_modern.open_action")) {
    actions.add("hr_modern.open_action", async (env, action) => {
        const xmlid = action.params?.xmlid;
        if (xmlid) {
            return env.services.action.doAction(xmlid, { stackPosition: "replaceCurrentAction" });
        }
    });
}
