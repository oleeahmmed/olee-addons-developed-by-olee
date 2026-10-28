{
    'name': 'Modern POS',
    'summary': "Simple Point of Sale: a shadcn-style selling screen (categories, products, cart, pay) on Odoo's own POS, plus a modern back office",
    'description': """
Modern POS gives the back office of Odoo's Point of Sale the look of Modern CRM: a clean
sidebar, a top bar for what is used less, a sales dashboard, CRM-style shop and order
cards and the CRM drawer for simple records.

Sidebar, as simple as the shadcn POS app: Menu (pick a category, tap products, adjust
the cart, choose the payment and "Create Order"), Tables (restaurants) and Orders.
Top bar: More (dashboard, shops, sessions, products, customers, payments, refunds,
ongoing orders), Reporting and Configuration.

Everything runs on Odoo's own pos.config / pos.session / pos.order / pos.payment and
products: the cashier screen, sessions, cash control, invoicing, accounting and access
rights stay Odoo's. No new table or field: only extra views (standalone kanban cards)
and pages, so an Odoo update cannot break the data.
    """,
    'version': '19.0.2.0.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'point_of_sale'],
    'data': [
        'views/pos_modern_views.xml',
        'views/pos_modern_actions.xml',
        'views/pos_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_modern/static/src/scss/app.scss',
            'pos_modern/static/src/scss/cards.scss',
            'pos_modern/static/src/scss/menu.scss',
            'pos_modern/static/src/js/app_context.js',
            'pos_modern/static/src/js/drawer.js',
            'pos_modern/static/src/js/pages.js',
            'pos_modern/static/src/js/dashboard.js',
            'pos_modern/static/src/js/menu.js',
            'pos_modern/static/src/js/sidebar.js',
            'pos_modern/static/src/xml/drawer.xml',
            'pos_modern/static/src/xml/dashboard.xml',
            'pos_modern/static/src/xml/menu.xml',
        ],
        'web.assets_web_dark': [
            'pos_modern/static/src/scss/app.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
