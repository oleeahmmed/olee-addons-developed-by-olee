{
    'name': 'POS Pharmacy (batch, expiry, strip / box, prescription)',
    'summary': "Pharmacy counter: generic-name search, strip / box / piece selling, batch (lot) picked first-expiry-first-out, expired stock blocked, prescription details, near-expiry page",
    'description': """
Pharmacy for the Modern POS counter (pos_modern). Install it only for a pharmacy:

* Medicine data on products: generic name, strength, dosage form, manufacturer, rack,
  "prescription required", pieces per strip and strips per box.
* Counter: search by brand or generic name; a medicine sold by piece, strip or box (the
  stock stays in pieces); the batch (lot) is picked First-Expiry-First-Out from the shop's
  stock, the line is split over several batches when needed; expired batches cannot be
  sold; the nearest expiry shows on the product card.
* Prescription (doctor, patient, Rx number) asked when a prescription medicine is sold,
  saved on the order and printed on the receipt.
* Near-expiry page: batches expiring in the next N days with their quantity.

Uses Odoo's lots and expiry dates (product_expiry). No stylesheet: Modern Theme's POS styles.
    """,
    'version': '19.0.1.2.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['pos_modern', 'product_expiry'],
    'data': [
        'views/pharmacy_views.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_pharmacy/static/src/js/*.js',
            'pos_pharmacy/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
