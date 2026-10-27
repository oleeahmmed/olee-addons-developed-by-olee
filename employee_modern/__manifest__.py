{
    'name': 'Modern Employees',
    'summary': 'A simple, modern workspace for the Odoo Employees app — built only on the standard models',
    'description': """
Modern Employees gives Odoo's Employees app a clean, modern interface (shadcn/ui look) with
a left sidebar: a people dashboard, employees, departments, job positions, new hires,
former employees and employee records. Adding, viewing and editing all use Odoo's own
employee, department and job forms (with the chatter), with a modern look.

* No new app: it lives inside the Employees app, which now opens on its dashboard.
* No new tables or fields: every screen reads and writes hr.employee, hr.department,
  hr.job and hr.version through Odoo's own views, wizards and methods.
* Rights, record rules, multi-company and settings are Odoo's own. Odoo's Reporting and
  Configuration menus stay one click away in the top bar.
* Time Off and Attendances keep their own apps: Modern Time Off (time_off_modern) and
  Modern Attendances (attendance_modern) install by themselves when Odoo's Time Off /
  Attendances apps are installed, and give those apps the same look and a simple sidebar.
    """,
    'version': '19.0.3.1.0',
    'category': 'Human Resources/Employees',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'hr', 'mail'],
    'data': [
        'views/employee_modern_actions.xml',
        'views/employee_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'employee_modern/static/src/scss/app.scss',
            'employee_modern/static/src/scss/hr_views.scss',
            'employee_modern/static/src/scss/hr_forms.scss',
            'employee_modern/static/src/scss/drawer.scss',
            # listed one by one, so files left over from an older version never load
            'employee_modern/static/src/js/sidebar/sidebar.js',
            'employee_modern/static/src/js/drawer/record_drawer.js',
            'employee_modern/static/src/js/pages/app_context.js',
            'employee_modern/static/src/js/pages/list_pages.js',
            'employee_modern/static/src/js/pages/dashboard.js',
            'employee_modern/static/src/js/pages/time_base.js',
            'employee_modern/static/src/js/pages/legacy_actions.js',
            'employee_modern/static/src/xml/dashboard.xml',
            'employee_modern/static/src/xml/time_base.xml',
            'employee_modern/static/src/xml/record_drawer.xml',
        ],
        'web.assets_web_dark': [
            'employee_modern/static/src/scss/app.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
