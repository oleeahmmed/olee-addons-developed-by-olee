{
    'name': 'Modern HRM',
    'summary': 'One modern workspace for Employees, Attendances and Time Off (shadcn/ui look)',
    'description': """
Modern HRM gives Odoo's HR apps one clean, modern interface (shadcn/ui look):

* Employees: employees, departments, new hires, contracts ending, former
  employees and employee history.
* Attendances: at work, attendances, extra hours.
* Time Off: requests, allocations, team calendar.

No new app, table or field: every screen reads and writes Odoo's own hr.employee,
hr.department, hr.job, hr.attendance, hr.leave and hr.leave.allocation through Odoo's
own views, wizards and methods. All styles live in Modern Theme (modern_theme); this
addon only holds the custom views.
    """,
    'version': '19.0.1.0.0',
    'category': 'Human Resources',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'hr', 'mail', 'hr_attendance', 'hr_holidays'],
    'data': [
        'views/employee_actions.xml',
        'views/employee_menus.xml',
        'views/attendance_actions.xml',
        'views/attendance_menus.xml',
        'views/time_off_actions.xml',
        'views/time_off_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'modern_hrm/static/src/js/sidebar/sidebar.js',
            'modern_hrm/static/src/js/drawer/record_drawer.js',
            'modern_hrm/static/src/js/pages/app_context.js',
            'modern_hrm/static/src/js/pages/list_pages.js',
            'modern_hrm/static/src/js/pages/time_base.js',
            'modern_hrm/static/src/js/pages/legacy_actions.js',
            'modern_hrm/static/src/js/attendance/attendance_drawer.js',
            'modern_hrm/static/src/js/attendance/pages.js',
            'modern_hrm/static/src/js/attendance/sidebar.js',
            'modern_hrm/static/src/js/time_off/pages.js',
            'modern_hrm/static/src/js/time_off/sidebar.js',
            'modern_hrm/static/src/xml/record_drawer.xml',
            'modern_hrm/static/src/xml/attendance_drawer.xml',
        ],
    },
    'installable': True,
    'application': False,
}
