{
    'name': 'Modern Inventory',
    'summary': 'A simple, modern workspace for the Odoo Inventory app — built only on the standard models',
    'description': """
Inventory Modern gives Odoo's Inventory app the same clean, modern interface as
CRM Modern and Sales Modern: a left sidebar, an owner dashboard, receipts,
deliveries, internal transfers, products, stock on hand and moves history.
Adding, viewing and editing all use Odoo's own forms, with a modern look.

* No new app: it lives inside the Inventory app, which now opens on its dashboard.
* No new tables or fields: every screen reads and writes stock.picking, stock.quant,
  stock.move.line, product.template... through Odoo's own views, wizards and methods.
* Rights, record rules, routes, settings and reports are Odoo's own. Odoo's
  original Inventory menus stay available (sidebar groups and top-bar menus).
    """,
    'version': '19.0.2.1.0',
    'category': 'Inventory/Inventory',
    'author': 'Your Name',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'stock', 'mail'],
    'data': [
        'views/report_layout.xml',
        'views/inventory_modern_actions.xml',
        'views/inventory_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'inventory_modern/static/src/scss/app.scss',
            'inventory_modern/static/src/scss/inventory.scss',
            'inventory_modern/static/src/js/sidebar/*.js',
            'inventory_modern/static/src/js/pages/*.js',
            'inventory_modern/static/src/xml/dashboard.xml',
        ],
        'web.assets_web_dark': [
            'inventory_modern/static/src/scss/app.dark.scss',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'installable': True,
    'application': False,
}
