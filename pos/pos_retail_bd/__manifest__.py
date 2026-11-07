{
    'name': 'POS Retail Bangladesh (offers, points, baki, scale barcodes)',
    'summary': "Grocery / fashion / electronics counter: offers (% off, buy X get Y, bill discount), loyalty points, customer credit (baki) with a limit and due collection, purchase history, weighing-scale barcodes",
    'description': """
Retail for the Modern POS counter (pos_modern). Install it for a grocery, super shop,
fashion or electronics shop:

* Offers with dates and shops: % off products or categories, buy X get Y free (BOGO),
  money off a bill above an amount. Applied by the server, shown in the cart.
* Loyalty points: earn per taka spent, redeem at the counter, balance on the receipt and
  in the SMS; ledger of every point.
* Baki (customer account): sell on credit up to each customer's limit, the due shown
  when the customer is picked, collect a due at the counter.
* The customer's last purchases at the counter.
* Weighing-scale barcodes (EAN-13 with a 2x prefix): weight or price embedded.

No stylesheet: Modern Theme's POS styles.
    """,
    'version': '19.0.1.2.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['pos_modern'],
    'data': [
        'security/ir.model.access.csv',
        'views/retail_views.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_retail_bd/static/src/js/*.js',
            'pos_retail_bd/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
