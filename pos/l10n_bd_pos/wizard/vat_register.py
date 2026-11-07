from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import date_utils


class L10nBdPosVatRegister(models.TransientModel):
    _name = 'l10n.bd.pos.vat.register'
    _description = 'VAT sales register (POS)'

    date_from = fields.Date(required=True, default=lambda self: date_utils.start_of(fields.Date.context_today(self), 'month'))
    date_to = fields.Date(required=True, default=lambda self: fields.Date.context_today(self))
    config_ids = fields.Many2many('pos.config', string="Shops", help="Empty = every shop")

    def _data(self):
        self.ensure_one()
        if self.date_to < self.date_from:
            raise UserError(_("The end date is before the start date."))
        return self.env['pos.order']._l10n_bd_vat_register(self.date_from, self.date_to, self.config_ids.ids)

    def action_print(self):
        return self.env.ref('l10n_bd_pos.action_report_vat_register').report_action(self)

    def action_preview(self):
        return self.env.ref('l10n_bd_pos.action_report_vat_register_html').report_action(self)
