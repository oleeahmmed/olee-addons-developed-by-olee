{
    'name': 'Modern Purchase',
    'summary': 'A simple, modern workspace for the Odoo Purchase app — built only on the standard models',
    'description': """
Modern Purchase gives Odoo's Purchase app a clean, modern interface with a left sidebar:
a dashboard, requests for quotation, purchase orders, orders to bill, vendors and products.
Adding, viewing and editing all use Odoo's own forms, with a modern look.

* No new app: it lives inside the Purchase app, which now opens on its dashboard.
* No new tables or fields: every screen reads and writes purchase.order, res.partner,
  product.template... through Odoo's own views, wizards and methods.
* Rights, record rules, settings, mail templates and invoicing are Odoo's own.
  Odoo's original Purchase menus stay available in the sidebar.
    """,
    'version': '19.0.2.0.2',
    'category': 'Inventory/Purchase',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'purchase', 'mail'],
    'data': [
        'views/purchase_modern_actions.xml',
        'views/purchase_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'purchase_modern/static/src/scss/tokens.scss',
            'purchase_modern/static/src/scss/pages.scss',
            'purchase_modern/static/src/scss/list.scss',
            'purchase_modern/static/src/scss/controls.scss',
            'purchase_modern/static/src/scss/purchase.scss',
            'purchase_modern/static/src/scss/dash.scss',
            'purchase_modern/static/src/js/core/*.js',
            'purchase_modern/static/src/js/components/*.js',
            'purchase_modern/static/src/js/sidebar/*.js',
            'purchase_modern/static/src/js/dash/*.js',
            'purchase_modern/static/src/js/pages/*.js',
            'purchase_modern/static/src/xml/*.xml',
        ],
        'web.assets_web_dark': [
            'purchase_modern/static/src/scss/tokens.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
