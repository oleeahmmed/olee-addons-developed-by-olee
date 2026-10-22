{
    'name': 'Modern Invoicing',
    'summary': 'A simple, modern workspace for the Odoo Invoicing app — built only on the standard models',
    'description': """
Modern Invoicing gives Odoo's Invoicing app a clean, modern interface with a left sidebar:
a dashboard (money in, money out, who owes what and for how long), customer invoices,
credit notes, payments received, vendor bills, refunds and payments made.
Adding, viewing and editing all use Odoo's own invoice and payment forms, with a modern look.

* No new app: it lives inside the Invoicing app, which now opens on its dashboard.
* No new tables or fields: every screen reads and writes account.move and
  account.payment through Odoo's own views, wizards and methods.
* Rights, record rules, journals, taxes, settings and reports are Odoo's own.
  Odoo's Reporting and Configuration menus stay available in the sidebar.
    """,
    'version': '19.0.1.0.0',
    'category': 'Accounting/Accounting',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'account', 'mail'],
    'data': [
        'views/invoice_modern_actions.xml',
        'views/invoice_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'invoice_modern/static/src/scss/app.scss',
            'invoice_modern/static/src/js/sidebar/*.js',
            'invoice_modern/static/src/js/pages/*.js',
            'invoice_modern/static/src/xml/*.xml',
        ],
        'web.assets_web_dark': [
            'invoice_modern/static/src/scss/app.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
