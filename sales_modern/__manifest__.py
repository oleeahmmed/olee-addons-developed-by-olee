{
    'name': 'Sales Modern',
    'summary': 'A simple, modern workspace for the Odoo Sales app — built only on the standard models',
    'description': """
Sales Modern gives Odoo's Sales app a clean, modern interface with a left sidebar:
a dashboard, quotations, sales orders, orders to invoice, customers and products.
Adding, viewing and editing all use Odoo's own forms, with a modern look.

* No new app: it lives inside the Sales app, which now opens on its dashboard.
* No new tables or fields: every screen reads and writes sale.order, res.partner,
  product.template... through Odoo's own views, wizards and methods.
* Rights, record rules, settings, mail templates, taxes, pricelists and invoicing
  are Odoo's own. Odoo's original Sales menus stay available in the sidebar.
    """,
    'version': '19.0.2.1.0',
    'category': 'Sales/Sales',
    'author': 'Your Name',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'sale_management', 'sales_team', 'mail'],
    'data': [
        'views/report_layout.xml',
        'views/sales_modern_team_views.xml',
        'views/sales_modern_actions.xml',
        'views/sales_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'sales_modern/static/src/scss/app.scss',
            'sales_modern/static/src/scss/teams.scss',
            'sales_modern/static/src/js/sidebar/*.js',
            'sales_modern/static/src/js/pages/*.js',
            'sales_modern/static/src/xml/dashboard.xml',
        ],
        'web.assets_web_dark': [
            'sales_modern/static/src/scss/app.dark.scss',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'installable': True,
    'application': False,
}
