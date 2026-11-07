{
    'name': 'POS Restaurant Bangladesh (KOT, kitchen screen, QR menu, delivery)',
    'summary': "Dine-in / takeaway / delivery orders, kitchen order tickets (KOT) and a kitchen display, open table bills, service charge, Foodpanda / Pathao delivery reference and a QR menu per table",
    'description': """
Restaurant for the Modern POS counter (pos_modern), on top of Odoo's restaurant option
(floors and tables). Install it only for a restaurant, café or food court:

* Order type on the counter: dine-in (table, guests), takeaway, delivery (customer,
  address, Foodpanda / Pathao / own rider, their order number, delivery charge).
* "Kitchen" sends only the new items as a kitchen order ticket (KOT, printed on the
  receipt printer) and keeps the table's bill open; pay it later from the table.
* Kitchen display: tickets as cards, new → cooking → ready → served, late ones marked.
* Service charge in % on dine-in bills.
* QR menu: a public menu page per shop and table, and printable QR cards for the tables.

No stylesheet: Modern Theme's POS styles (and its frontend styles for the QR menu).
    """,
    'version': '19.0.1.2.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['pos_modern', 'pos_restaurant'],
    'data': [
        'security/ir.model.access.csv',
        'views/restaurant_views.xml',
        'views/qr_templates.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_restaurant_bd/static/src/js/*.js',
            'pos_restaurant_bd/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
