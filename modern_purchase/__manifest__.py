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
    'version': '19.0.1.0.0',
    'category': 'Inventory/Purchase',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['purchase', 'mail'],
    'data': [
        'views/modern_purchase_actions.xml',
        'views/modern_purchase_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'modern_purchase/static/src/scss/tokens.scss',
            'modern_purchase/static/src/scss/components.scss',
            'modern_purchase/static/src/scss/pages.scss',
            'modern_purchase/static/src/scss/list.scss',
            'modern_purchase/static/src/scss/controls.scss',
            'modern_purchase/static/src/scss/sidebar.scss',
            'modern_purchase/static/src/scss/purchase.scss',
            'modern_purchase/static/src/scss/chatter.scss',
            'modern_purchase/static/src/scss/dash.scss',
            'modern_purchase/static/src/js/core/*.js',
            'modern_purchase/static/src/js/components/*.js',
            'modern_purchase/static/src/js/sidebar/*.js',
            'modern_purchase/static/src/js/dash/*.js',
            'modern_purchase/static/src/js/pages/*.js',
            'modern_purchase/static/src/xml/*.xml',
        ],
        'web.assets_web_dark': [
            'modern_purchase/static/src/scss/tokens.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
