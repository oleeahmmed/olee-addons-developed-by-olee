{
    'name': 'Modern Reports',
    'summary': 'One clean print design for invoices, bills, quotations, sales and purchase orders',
    'description': """
Install to switch every customer invoice, credit note, vendor bill, quotation, sales order,
pro-forma invoice, RFQ and purchase order PDF to the Modern Reports design:
logo / company / document-info header, accent title band, compact party row, item table,
totals with paid / amount due, amount in words (lakh / crore for BDT and INR),
payment method cards, terms and signatures.

Uninstall to get the standard Odoo layouts back.

Colours, font and background follow Odoo's Document Layout (or the Modern Theme brand colour,
or a custom colour). Empty item rows fill the page so totals and signatures always sit at the
bottom of the last page.

Design options: item table borders (row lines, all borders, striped, minimal), table header,
title style, row spacing, text size, page frame, line numbers, amount in words, payment cards.
Delivery slips follow the same design when Inventory is installed (modern_reports_stock).

Settings > Invoicing > Modern Reports.
    """,
    'version': '19.0.2.2.0',
    'category': 'Accounting/Accounting',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['account', 'sale', 'purchase'],
    'data': [
        'security/ir.model.access.csv',
        'security/security.xml',
        'report/paperformat.xml',
        'report/layout.xml',
        'report/report_overrides.xml',
        'views/payment_method_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'web.report_assets_common': [
            'modern_reports/static/src/scss/modern_reports.scss',
        ],
        'web.report_assets_pdf': [
            'modern_reports/static/src/js/page_fill.js',
        ],
    },
    'installable': True,
    'application': False,
}
