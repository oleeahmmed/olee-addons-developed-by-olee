{
    'name': 'Modern Time Off',
    'summary': "Modern look and a simple sidebar for Odoo's Time Off app (dashboard, requests, allocations)",
    'description': """
Modern Time Off is the Time Off part of Modern Employees. It installs by itself when both
Modern Employees and Odoo's Time Off app are installed.

Sidebar of the Time Off app: Dashboard, Requests (approve / refuse on the line, calendar),
Allocations, Team Calendar and My Time. Reporting and Configuration are in the top bar.
Everything uses Odoo's own hr.leave / hr.leave.allocation views, forms and chatter:
no new table or field.
    """,
    'version': '19.0.2.1.0',
    'category': 'Human Resources/Time Off',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['employee_modern', 'hr_holidays'],
    'auto_install': True,
    'pre_init_hook': 'pre_init_hook',
    'data': [
        'views/actions.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'time_off_modern/static/src/scss/*.scss',
            'time_off_modern/static/src/js/*.js',
            'time_off_modern/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
