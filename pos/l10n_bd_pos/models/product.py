from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    l10n_bd_name_bn = fields.Char(string="Name in Bangla", translate=False,
                                  help="Printed on the receipt and searched at the counter.")
    l10n_bd_hs_code = fields.Char(string="H.S. code")
