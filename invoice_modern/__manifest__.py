{
    'name': 'Modern Invoicing',
    'summary': 'A simple, modern workspace for the Odoo Invoicing app — built only on the standard models',
    'description': """
Modern Invoicing gives Odoo's Invoicing app a clean, modern interface with a left sidebar,
short and flat: Invoices, Bills, Payments (received / made), Contacts (customers / vendors),
Products (for sale / for purchase) and a small Accounting group (journal entries, general
ledger, trial balance, P&L, balance sheet, tax report). Credit notes, refunds and the less
used accounting pages stay one click away in the top bar.
It also carries the accountant's pages in the same app: journal items, chart of accounts,
partner ledger, cash & bank book, invoice analysis and audit trail.
Adding, viewing and editing all use Odoo's own invoice, payment and journal forms,
with a modern look.

* No new app: it lives inside the Invoicing app, which opens on Invoices.
* No dashboards: the app goes straight to the records.
* No new tables or fields: every screen reads and writes account.move and
  account.payment through Odoo's own views, wizards and methods.
* Rights, record rules, journals, taxes, settings and reports are Odoo's own.
  Odoo's Reporting and Configuration menus stay available in the top bar.
    """,
    'version': '19.0.1.2.2',
    'category': 'Accounting/Accounting',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'account', 'mail'],
    'data': [
        'security/invoice_modern_groups.xml',
        'views/invoice_modern_actions.xml',
        'views/payment_method_views.xml',
        'views/invoice_modern_accounting_actions.xml',
        'views/invoice_modern_menus.xml',
        'views/invoice_modern_accounting_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'invoice_modern/static/src/js/sidebar/*.js',
            'invoice_modern/static/src/js/pages/*.js',
        ],
    },
    'uninstall_hook': 'uninstall_hook',
    'installable': True,
    'application': False,
}
