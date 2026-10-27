"""Clean-up of pages that moved out of Modern Employees.

Up to version 19.0.1.2 the Time Off and Attendance pages (and some configuration
shortcuts) lived inside the Employees app. They now belong to Modern Time Off
(time_off_modern) and Modern Attendances (attendance_modern), which reuse the same page
addresses (e.g. /odoo/modern-attendance). Odoo removes the old records only at the very
end of an update, so installing those addons in the same run failed on the duplicate
address. This removes the old records first (plain SQL: safe to run more than once).
"""

OLD_MODULES = ("employee_modern", "hr_modern")

MOVED_ACTIONS = (
    "action_time_off_overview", "action_time_off_approve", "action_time_off_all",
    "action_time_off_requests", "action_time_off_allocations",
    "action_attendance_overview", "action_attendance_all", "action_attendance_at_work",
    "action_attendance_overtime",
    "action_open_leave_types", "action_open_accrual_plans", "action_open_public_holidays",
    "action_open_mandatory_days", "action_open_overtime_rules", "action_open_kiosk",
)
MOVED_MENUS = (
    "menu_time_off_overview", "menu_time_off_approve", "menu_time_off_all",
    "menu_time_off_requests", "menu_time_off_allocations",
    "menu_attendance_overview", "menu_attendance_at_work", "menu_attendance_all",
    "menu_attendance_overtime", "menu_at_work",
    "menu_config_leave_types", "menu_config_accrual_plans", "menu_config_public_holidays",
    "menu_config_mandatory_days", "menu_config_overtime_rules", "menu_config_kiosk",
    # parents last
    "menu_time_off", "menu_attendance", "menu_config_time_off", "menu_config_attendance",
)


def _ids(cr, model, names):
    cr.execute(
        "SELECT name, res_id FROM ir_model_data WHERE module = ANY(%s) AND model = %s AND name = ANY(%s)",
        (list(OLD_MODULES), model, list(names)),
    )
    return dict(cr.fetchall())


def remove_moved_pages(cr):
    menus = _ids(cr, "ir.ui.menu", MOVED_MENUS)
    for name in MOVED_MENUS:  # children before their parents
        if name in menus:
            cr.execute("UPDATE ir_ui_menu SET parent_id = NULL WHERE parent_id = %s", (menus[name],))
            cr.execute("DELETE FROM ir_ui_menu WHERE id = %s", (menus[name],))
    actions = _ids(cr, "ir.actions.client", MOVED_ACTIONS)
    if actions:
        cr.execute("DELETE FROM ir_act_client WHERE id = ANY(%s)", (list(actions.values()),))
    cr.execute(
        "DELETE FROM ir_model_data WHERE module = ANY(%s) AND model IN ('ir.ui.menu', 'ir.actions.client') "
        "AND name = ANY(%s)",
        (list(OLD_MODULES), list(MOVED_MENUS + MOVED_ACTIONS)),
    )
    # "Records" was a page before it became a group of the top bar: no action on it.
    cr.execute(
        "UPDATE ir_ui_menu SET action = NULL WHERE id IN ("
        " SELECT res_id FROM ir_model_data WHERE module = ANY(%s) AND model = 'ir.ui.menu' AND name = 'menu_records')",
        (list(OLD_MODULES),),
    )


def pre_init_hook(env):
    remove_moved_pages(env.cr)
