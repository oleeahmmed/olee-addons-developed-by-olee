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
    "hr_modern.dashboard": "modern_hrm.employee_action_dashboard",
    "hr_modern.employees": "modern_hrm.employee_action_employees",
    "hr_modern.departments": "modern_hrm.employee_action_departments",
    "hr_modern.jobs": "modern_hrm.employee_action_jobs",
    "hr_modern.new_hires": "modern_hrm.employee_action_new_hires",
    "hr_modern.contracts_ending": "modern_hrm.employee_action_contracts_ending",
    "hr_modern.former": "modern_hrm.employee_action_former",
    "hr_modern.records": "modern_hrm.employee_action_records",
    // Time Off, first inside Employees, then hr_modern_holidays
    "hr_modern.timeoff_dashboard": "modern_hrm.time_off_action_dashboard",
    "hr_modern.timeoff_approve": "modern_hrm.time_off_action_requests",
    "hr_modern.timeoff_all": "modern_hrm.time_off_action_requests",
    "hr_modern.timeoff_requests": "modern_hrm.time_off_action_requests",
    "hr_modern.timeoff_allocations": "modern_hrm.time_off_action_allocations",
    "hr_modern_holidays.dashboard": "modern_hrm.time_off_action_dashboard",
    "hr_modern_holidays.requests": "modern_hrm.time_off_action_requests",
    "hr_modern_holidays.allocations": "modern_hrm.time_off_action_allocations",
    // Attendances, first inside Employees, then hr_modern_attendance
    "hr_modern.attendance_dashboard": "modern_hrm.attendance_action_dashboard",
    "hr_modern.attendance_all": "modern_hrm.attendance_action_attendances",
    "hr_modern.attendance_at_work": "modern_hrm.attendance_action_at_work",
    "hr_modern.attendance_overtime": "modern_hrm.attendance_action_extra_hours",
    "hr_modern_attendance.dashboard": "modern_hrm.attendance_action_dashboard",
    "hr_modern_attendance.attendances": "modern_hrm.attendance_action_attendances",
    "hr_modern_attendance.at_work": "modern_hrm.attendance_action_at_work",
    "hr_modern_attendance.extra_hours": "modern_hrm.attendance_action_extra_hours",
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
            return env.services.action.doAction("modern_hrm.employee_action_dashboard", options);
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
