from odoo import api, fields, models

PROVIDERS = [
    ('bkash', 'bKash'),
    ('nagad', 'Nagad'),
    ('rocket', 'Rocket (DBBL)'),
    ('upay', 'Upay'),
    ('tap', 'TAP'),
    ('card', 'Card (POS terminal)'),
    ('bank', 'Bank transfer'),
    ('other', 'Other'),
]
WALLETS = ('bkash', 'nagad', 'rocket', 'upay', 'tap')
ICONS = {
    'bkash': 'fa-mobile', 'nagad': 'fa-mobile', 'rocket': 'fa-mobile', 'upay': 'fa-mobile', 'tap': 'fa-mobile',
    'card': 'fa-credit-card', 'bank': 'fa-university', 'other': 'fa-exchange',
}


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    bd_provider = fields.Selection(PROVIDERS, string="BD provider",
                                   help="Mobile wallet or channel of this payment method (Bangladesh).")
    bd_needs_trx = fields.Boolean(string="Ask the TrxID",
                                  help="The cashier types the transaction ID of the payment (wallets, card slip).")
    bd_needs_phone = fields.Boolean(string="Ask the payer's number")
    bd_trx_pattern = fields.Char(string="TrxID format", default=r'^[A-Z0-9]{6,20}$',
                                 help="Regular expression the TrxID must match (upper case letters and digits). "
                                      "Leave empty to accept anything.")
    bd_merchant_number = fields.Char(string="Merchant / agent number",
                                     help="Shown to the cashier: the number the customer sends money to.")
    bd_is_wallet = fields.Boolean(compute='_compute_bd_is_wallet', store=True, string="Mobile wallet")

    @api.depends('bd_provider')
    def _compute_bd_is_wallet(self):
        for method in self:
            method.bd_is_wallet = method.bd_provider in WALLETS

    @api.onchange('bd_provider')
    def _onchange_bd_provider(self):
        if self.bd_provider in WALLETS:
            self.bd_needs_trx = True
            self.bd_needs_phone = True
