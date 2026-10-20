{
    'name': 'Manufacturing Modern',
    'summary': 'A simple, modern workspace for the Odoo Manufacturing app — built only on the standard models',
    'description': """
Manufacturing Modern gives Odoo's Manufacturing app a clean, modern interface with
a left sidebar: a dashboard, manufacturing orders, bills of materials, unbuild
orders, work orders, work centers and products.
Adding, viewing and editing all use Odoo's own forms, with a modern look.

* No new app: it lives inside the Manufacturing app, which now opens on its dashboard.
* No new tables or fields: every screen reads and writes mrp.production, mrp.bom,
  mrp.workorder, product.template... through Odoo's own views, wizards and methods.
* Rights, record rules, work orders, settings and reports are Odoo's own.
  Odoo's original Manufacturing menus stay available (sidebar groups and top-bar menus).
    """,
    'version': '19.0.1.1.0',
    'category': 'Manufacturing/Manufacturing',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'mrp', 'mail'],
    'data': [
        'views/mrp_modern_actions.xml',
        'views/mrp_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'mrp_modern/static/src/scss/tokens.scss',
            'mrp_modern/static/src/scss/pages.scss',
            'mrp_modern/static/src/scss/list.scss',
            'mrp_modern/static/src/scss/controls.scss',
            'mrp_modern/static/src/scss/mrp.scss',
            'mrp_modern/static/src/scss/dash.scss',
            'mrp_modern/static/src/js/core/*.js',
            'mrp_modern/static/src/js/components/*.js',
            'mrp_modern/static/src/js/sidebar/*.js',
            'mrp_modern/static/src/js/dash/*.js',
            'mrp_modern/static/src/js/pages/*.js',
            'mrp_modern/static/src/xml/*.xml',
        ],
        'web.assets_web_dark': [
            'mrp_modern/static/src/scss/tokens.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
