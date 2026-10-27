{
    'name': 'Modern Attendances',
    'summary': "Modern look and a simple sidebar for Odoo's Attendances app (dashboard, at work, attendances, extra hours)",
    'description': """
Modern Attendances is the Attendances part of Modern Employees. It installs by itself when
both Modern Employees and Odoo's Attendances app are installed.

Sidebar of the Attendances app: Dashboard, At Work, Attendances and Extra Hours (approve /
refuse). Kiosk Mode, Reporting and Configuration are in the top bar. Everything uses
Odoo's own hr.attendance views, forms and chatter: no new table or field.
    """,
    'version': '19.0.2.1.0',
    'category': 'Human Resources/Attendances',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['employee_modern', 'hr_attendance'],
    'auto_install': True,
    'pre_init_hook': 'pre_init_hook',
    'data': [
        'views/actions.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'attendance_modern/static/src/scss/*.scss',
            'attendance_modern/static/src/js/*.js',
            'attendance_modern/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
