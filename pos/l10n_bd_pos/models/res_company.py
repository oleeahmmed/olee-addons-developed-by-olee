import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


def _check_bin(value):
    digits = re.sub(r'\D', '', value or '')
    return not value or len(digits) in (9, 13)


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_bd_bin = fields.Char(string="BIN", help="VAT Business Identification Number (13 digits, or 9 + branch).")
    l10n_bd_vat_area = fields.Char(string="VAT division / circle")

    @api.constrains('l10n_bd_bin')
    def _check_l10n_bd_bin(self):
        for company in self:
            if not _check_bin(company.l10n_bd_bin):
                raise ValidationError(_("A BIN has 13 digits (or 9 digits without the branch code)."))


class ResPartner(models.Model):
    _inherit = 'res.partner'

    l10n_bd_bin = fields.Char(string="BIN", help="Customer's VAT Business Identification Number, printed on Mushak-6.3.")

    @api.constrains('l10n_bd_bin')
    def _check_l10n_bd_bin(self):
        for partner in self:
            if not _check_bin(partner.l10n_bd_bin):
                raise ValidationError(_("A BIN has 13 digits (or 9 digits without the branch code)."))
