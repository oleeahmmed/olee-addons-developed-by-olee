from odoo import fields, models


class ModernReportsPaymentMethod(models.Model):
    _name = 'modern.reports.payment.method'
    _description = 'Payment method printed on documents'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True, help='Card title, e.g. "Bank Transfer", "bKash", "Cash".')
    kind = fields.Selection(
        [('bank', 'Bank'), ('mobile', 'Mobile wallet'), ('cash', 'Cash'), ('card', 'Card'), ('other', 'Other')],
        required=True, default='bank', help='Selects the icon on the card.',
    )
    detail = fields.Char(translate=True, help='Small grey line, e.g. bank name, "Merchant", "At counter".')
    value = fields.Char(help='Main line, e.g. account number, wallet number, showroom.')
    highlight = fields.Boolean(help='Draw this card with the accent background (the preferred method).')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company', required=True, default=lambda self: self.env.company, ondelete='cascade',
    )
