{
    'name': 'POS Clothes (size × colour matrix, hand tags, size report)',
    'summary': "Clothing and fashion counter: one card per style with a size × colour matrix (sold-out sizes greyed), hand tags with size and care text, fabric sold by metre / yard, fast and slow sizes report",
    'description': """
Clothing shop for the Modern POS counter (pos_modern). Install it for a fashion,
clothing, saree, shoe or fabric shop:

* One card per style on the counter; a tap opens the size × colour matrix with the
  stock of every size, sold-out sizes greyed out. A scanned barcode adds the variant
  directly.
* Hand tags: the barcode labels of the core print the size / colour and the care text
  (wash care, fabric) on 58 × 40 mm tags.
* Fabric by the metre / yard / gaj: products sold in a length unit ask the length
  (core quantity pad).
* Sizes report: what sold in the last days per size and colour against the stock —
  fast sizes running out, slow sizes piling up.
* Exchange (S → M) is the core Return / Exchange of pos_modern.
* Eid / Puja prices: the offers of pos_retail_bd or Odoo's pricelists with dates.

Variants are Odoo's own product attributes. No stylesheet: Modern Theme's POS styles.
    """,
    'version': '19.0.1.1.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['pos_modern'],
    'data': [
        'views/clothes_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_clothes/static/src/js/*.js',
            'pos_clothes/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
