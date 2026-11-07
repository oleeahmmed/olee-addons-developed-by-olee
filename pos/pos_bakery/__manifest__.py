{
    'name': 'POS Bakery (token, morning bake, wastage, cake orders)',
    'summary': "Bakery and sweet shop counter: queue token on the receipt, the morning production batch (ingredients used by the recipe), wastage, cake advance orders (date, message, advance) and the day's baked / sold / wasted / left report",
    'description': """
Bakery for the Modern POS counter (pos_modern). No tables, no kitchen screen:

* Token: every sale gets a daily token number ("Token 42"), printed big on the receipt
  and, if wanted, on its own slip.
* Morning bake: a production batch (200 breads, 50 cakes…). Products with a recipe (Odoo
  bill of materials) are made with a manufacturing order, so flour, sugar, butter are
  taken out of the stock; the others are added to the stock.
* Wastage: unsold or spoiled items written off from the counter (stock scrap).
* Cake orders: customer, mobile, delivery date and time, flavour, weight, message on the
  cake, price and advance. The advance is taken at the counter now; on delivery the cake
  is sold and the advance deducted.
* Day report: baked, sold, wasted and left, per product.

Recipes are Odoo's own (mrp). No stylesheet: Modern Theme's POS styles.
    """,
    'version': '19.0.1.1.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['pos_modern', 'mrp'],
    'data': [
        'security/ir.model.access.csv',
        'data/bakery_data.xml',
        'views/bakery_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_bakery/static/src/js/*.js',
            'pos_bakery/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
