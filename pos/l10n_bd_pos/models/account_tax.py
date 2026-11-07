from odoo import fields, models


class AccountTax(models.Model):
    _inherit = 'account.tax'

    l10n_bd_kind = fields.Selection([
        ('vat', 'VAT'),
        ('sd', 'Supplementary Duty (SD)'),
        ('at', 'Advance Tax (AT)'),
        ('other', 'Other'),
    ], string="BD tax kind", help="How Mushak-6.3 and the VAT register show this tax. Empty = VAT.")
