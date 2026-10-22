{
    'name': 'Modern Contacts',
    'summary': 'A simple, modern workspace for the Odoo Contacts app — built only on the standard models',
    'description': """
Modern Contacts gives Odoo's Contacts app a clean, modern interface with a left sidebar:
a dashboard, all contacts, companies, people, customers and vendors.
Adding, viewing and editing all use Odoo's own contact form, with a modern look.

* No new app: it lives inside the Contacts app, which now opens on its dashboard.
* No new tables or fields: every screen reads and writes res.partner through Odoo's
  own views and methods.
* Sales, purchase and invoicing figures only show when those apps are installed and
  the user may see them. Customers / Vendors pages need Invoicing.
* Rights, record rules and settings are Odoo's own; Odoo's Configuration menu stays
  available in the sidebar.
    """,
    'version': '19.0.1.0.0',
    'category': 'Sales/CRM',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'contacts', 'mail'],
    'data': [
        'views/customer_modern_actions.xml',
        'views/customer_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'customer_modern/static/src/scss/app.scss',
            'customer_modern/static/src/js/sidebar/*.js',
            'customer_modern/static/src/js/pages/*.js',
            'customer_modern/static/src/xml/*.xml',
        ],
        'web.assets_web_dark': [
            'customer_modern/static/src/scss/app.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
