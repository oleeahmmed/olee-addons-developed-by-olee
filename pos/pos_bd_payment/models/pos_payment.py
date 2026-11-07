from odoo import fields, models


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    transaction_id = fields.Char(index='btree_not_null')
    bd_payer_phone = fields.Char(string="Payer's number")
    bd_provider = fields.Selection(related='payment_method_id.bd_provider', store=True, string="BD provider")
    bd_verified = fields.Boolean(string="Verified", help="Found in the wallet / bank statement.")
    bd_verified_by = fields.Many2one('res.users', string="Verified by", readonly=True)
    bd_verified_at = fields.Datetime(string="Verified on", readonly=True)

    def pos_bd_set_verified(self, verified=True):
        self.write({
            'bd_verified': bool(verified),
            'bd_verified_by': self.env.uid if verified else False,
            'bd_verified_at': fields.Datetime.now() if verified else False,
        })
        return True
