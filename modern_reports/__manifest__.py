{
    'name': 'Modern Reports',
    'summary': 'Modern printed documents for invoices, proformas, sales orders and purchase orders',
    'description': """
Modern print design shared by invoices, proforma invoices, sales orders and purchase orders:
logo / company / copy-label letterhead, accent title band, meta grid, parties, per-tax item
columns, totals from Odoo's computed amounts, bank details, terms and signature.

Accent colour and page background follow the Modern Theme brand colour and can be overridden
per company in Settings > Modern Theme > Documents.
    """,
    'version': '19.0.1.0.0',
    'category': 'Sales/Sales',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'account', 'sale', 'purchase'],
    'data': [
        'views/res_config_settings_views.xml',
        'report/paperformat.xml',
        'report/document_page.xml',
        'report/document_invoice.xml',
        'report/copy_wrappers.xml',
        'report/report_actions.xml',
    ],
    'assets': {
        'web.report_assets_common': [
            'modern_reports/static/src/scss/document.scss',
        ],
    },
    'installable': True,
    'application': False,
}
