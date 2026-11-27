{
    'name': 'POS Reports',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'List-style POS reports with date filters and Excel export',
    'description': """
Read-only reporting views for the Point of Sale:
POS data list, daily business summary, product profit,
session closing / cash reconciliation and dead vs fast stock.
Every report is a native list with date filters and the built-in
Excel (.xlsx) export, so no data is copied and nothing breaks on upgrade.
""",
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'account', 'purchase', 'stock'],
    'data': [
        'security/ir.model.access.csv',
        'views/report_pos_order_views.xml',
        'views/report_daily_summary_views.xml',
        'views/report_product_profit_views.xml',
        'views/report_session_close_views.xml',
        'views/report_stock_flow_views.xml',
        'views/report_menus.xml',
    ],
    'installable': True,
    'application': False,
}