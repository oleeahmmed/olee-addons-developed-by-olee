{
    'name': 'Modern Reports - Inventory',
    'summary': 'Delivery slips, receipts and transfers printed in the Modern Reports design',
    'description': """
Bridge between Modern Reports and Inventory, installed automatically when both are installed.

The Delivery Slip print of every transfer (deliveries, receipts, internal transfers) uses the
Modern Reports document: same header, title band, party row, item table (ordered / delivered
quantities, lots and packages) and signatures as invoices and orders, with the same design
settings (Settings > Invoicing > Modern Reports).

Uninstall to get Odoo's own delivery slip back.
    """,
    'version': '19.0.1.0.0',
    'category': 'Inventory/Inventory',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_reports', 'stock'],
    'data': [
        'report/report_overrides.xml',
    ],
    'installable': True,
    'auto_install': True,
    'application': False,
}
