from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    mr_accent_color = fields.Char(related='company_id.mr_accent_color', readonly=False)

    def action_mr_payment_methods(self):
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Payment Methods on Documents'),
            'res_model': 'modern.reports.payment.method',
            'view_mode': 'list',
            'domain': [('company_id', '=', self.company_id.id)],
            'context': {'default_company_id': self.company_id.id},
        }
