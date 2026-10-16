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
    'version': '19.0.1.0.0',
    'category': 'Inventory/Inventory',
    'author': 'Your Name',
    'license': 'LGPL-3',
    'depends': ['stock', 'mail'],
    'data': [
        'views/report_layout.xml',
        'views/modern_inventory_actions.xml',
        'views/modern_inventory_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'modern_inventory/static/src/scss/tokens.scss',
            'modern_inventory/static/src/scss/components.scss',
            'modern_inventory/static/src/scss/pages.scss',
            'modern_inventory/static/src/scss/list.scss',
            'modern_inventory/static/src/scss/controls.scss',
            'modern_inventory/static/src/scss/sidebar.scss',
            'modern_inventory/static/src/scss/forms.scss',
            'modern_inventory/static/src/scss/print.scss',
            'modern_inventory/static/src/scss/chatter.scss',
            'modern_inventory/static/src/scss/dash.scss',
            'modern_inventory/static/src/scss/inventory.scss',
            'modern_inventory/static/src/js/core/*.js',
            'modern_inventory/static/src/js/components/*.js',
            'modern_inventory/static/src/js/sidebar/*.js',
            'modern_inventory/static/src/js/dash/*.js',
            'modern_inventory/static/src/js/pages/*.js',
            'modern_inventory/static/src/js/print/*.js',
            'modern_inventory/static/src/xml/*.xml',
        ],
        'web.report_assets_common': [
            'modern_inventory/static/src/scss/report_modern.scss',
        ],
        'web.assets_web_dark': [
            'modern_inventory/static/src/scss/tokens.dark.scss',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'installable': True,
    'application': False,
}
