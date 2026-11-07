{
    'name': 'Bangladesh VAT for POS (BIN, Mushak-6.3 / 6.7)',
    'summary': "BIN on company and customers, Mushak-6.3 tax invoice and Mushak-6.7 credit note from POS orders, VAT / SD split, VAT sales register, Bangla receipt",
    'description': """
Bangladesh VAT compliance for the Modern POS counter (pos_modern):

* BIN (Business Identification Number) of the company and of the customers.
* Taxes marked as VAT, Supplementary Duty (SD) or Advance Tax, so the receipt and the
  Mushak forms show them apart.
* Mushak-6.3 (tax invoice, কর চালানপত্র) as an A4 PDF for any POS order, with its own
  sequential number; Mushak-6.7 (credit note) for refunds.
* Thermal receipt: BIN, "Mushak-6.3" title, VAT per rate, buyer BIN, product names in
  Bangla (English, Bangla or both) and Bangla digits if wanted.
* VAT sales register per day (sales, SD, VAT per rate) for the monthly return.

Works with or without Odoo's l10n_bd chart of accounts. Check the forms with your VAT
consultant: NBR may change them.
    """,
    'version': '19.0.1.1.0',
    'category': 'Accounting/Localizations/Point of Sale',
    'countries': ['bd'],
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['pos_modern'],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_sequence.xml',
        'views/l10n_bd_views.xml',
        'report/mushak_report.xml',
        'report/vat_register_report.xml',
        'wizard/vat_register_views.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'l10n_bd_pos/static/src/js/*.js',
            'l10n_bd_pos/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
