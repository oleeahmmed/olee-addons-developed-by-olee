{
    'name': 'Modern POS',
    'summary': "POS core for every shop: fast counter (split payment, change, hold bill, discounts + manager PIN, 58/80 mm receipt, shortcuts, stock, offline queue, X/Z day end) on Odoo's own POS, plus a modern back office",
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
rights stay Odoo's.

This is the core of the Bangladesh POS family (custom-addons/pos): install it alone for
any shop, then add only what the business needs —
pos_bd_payment (bKash / Nagad / Rocket / Upay + TrxID, reconciliation, SMS receipt),
l10n_bd_pos (BIN, Mushak-6.3 / 6.7, VAT register, Bangla receipt),
pos_pharmacy, pos_restaurant_bd, pos_retail_bd.
    """,
    'version': '19.0.3.3.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'views/pos_modern_views.xml',
        'views/pos_counter_views.xml',
        'views/pos_modern_actions.xml',
        'views/pos_modern_menus.xml',
    ],
    # No stylesheet here: every POS style is in Modern Theme
    # (modern_theme/static/src/scss/apps/pos.scss), shared with the shop addons.
    'assets': {
        'web.assets_backend': [
            'pos_modern/static/src/js/app_context.js',
            'pos_modern/static/src/js/drawer.js',
            'pos_modern/static/src/js/drawer_forms.js',
            'pos_modern/static/src/js/pages.js',
            'pos_modern/static/src/js/dashboard.js',
            'pos_modern/static/src/js/counter/print.js',
            'pos_modern/static/src/js/counter/offline.js',
            'pos_modern/static/src/js/counter/dialogs.js',
            'pos_modern/static/src/js/counter/tools.js',
            'pos_modern/static/src/js/menu.js',
            'pos_modern/static/src/js/sidebar.js',
            'pos_modern/static/src/xml/drawer.xml',
            'pos_modern/static/src/xml/dashboard.xml',
            'pos_modern/static/src/xml/counter.xml',
            'pos_modern/static/src/xml/menu.xml',
        ],
    },
    'installable': True,
    'application': False,
}
