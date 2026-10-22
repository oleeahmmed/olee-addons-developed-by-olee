{
    'name': 'Modern Accounting',
    'summary': "An Accounting app for accountants: entries, ledgers, trial balance, P&L and balance sheet — "
               "built only on Odoo's own accounting",
    'description': """
Modern Accounting adds an **Accounting** app to the sidebar, made for the accountant.
It arranges Odoo's own accounting features into a few simple pages:

* **Dashboard** — income, expenses and profit for the period, cash and bank balances,
  what customers owe and what you owe, and what needs checking (draft entries,
  entries to review, unmatched bank transactions, overdue items).
* **Daily work** — journal entries, journal items, payments and Odoo's journal overview.
* **Ledgers** — chart of accounts, general ledger, partner ledger, cash & bank book
  and trial balance.
* **Reporting** (top bar) — profit & loss, balance sheet, tax report, invoice analysis,
  analytic report and audit trail.
* **Configuration** (top bar) — Odoo's settings, journals, taxes, fiscal positions,
  currencies, payment terms, reconciliation models and analytic accounting.

No new table, model or field: every page shows Odoo's own account.move,
account.move.line, account.payment and account.account records through Odoo's
own list, pivot, graph and form views, with Odoo's own rights and record rules.
Invoices and bills stay in the Invoicing app.
    """,
    'version': '19.0.1.0.0',
    'category': 'Accounting/Accounting',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'account', 'mail'],
    'data': [
        'security/modern_accounting_groups.xml',
        'views/modern_accounting_actions.xml',
        'views/modern_accounting_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'modern_accounting/static/src/scss/app.scss',
            'modern_accounting/static/src/js/sidebar/*.js',
            'modern_accounting/static/src/js/pages/*.js',
            'modern_accounting/static/src/xml/*.xml',
        ],
        'web.assets_web_dark': [
            'modern_accounting/static/src/scss/app.dark.scss',
        ],
    },
    'uninstall_hook': 'uninstall_hook',
    'installable': True,
    'application': True,
}
