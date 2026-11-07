{
    'name': 'POS Bangladesh Payments (bKash, Nagad, Rocket, Upay)',
    'summary': "Mobile wallet tenders with TrxID, duplicate TrxID guard, day-end wallet reconciliation and SMS receipts (BulkSMSBD, SSL Wireless or any HTTP gateway)",
    'description': """
Bangladesh payments for the Modern POS counter (pos_modern):

* bKash, Nagad, Rocket, Upay, TAP, card and bank as separate tenders, one click to create
  them with their own journal ("Set up BD wallets").
* Transaction ID (TrxID) and the payer's number asked at the counter for wallets, format
  checked, and refused when the same TrxID was already used (a common fraud).
* The merchant number shown to the cashier ("send to 01…").
* Mobile wallet reconciliation page: every wallet payment of a day or a session with its
  TrxID; paste the merchant statement and the matching TrxIDs are ticked automatically.
* Wallet block on the X / Z report.
* SMS receipt to the customer (automatic or with a button), through BulkSMSBD,
  SSL Wireless or any HTTP gateway, sent in the background with a log.

No stylesheet: the screens use Modern Theme's POS styles.
    """,
    'version': '19.0.1.3.0',
    'category': 'Sales/Point of Sale',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['pos_modern'],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_cron.xml',
        'views/pos_payment_method_views.xml',
        'views/sms_views.xml',
        'views/pos_config_views.xml',
        'views/menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_bd_payment/static/src/js/*.js',
            'pos_bd_payment/static/src/xml/*.xml',
        ],
    },
    'installable': True,
    'application': False,
}
