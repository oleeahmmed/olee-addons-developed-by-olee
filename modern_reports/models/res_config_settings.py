from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    mr_color_source = fields.Selection(related='company_id.mr_color_source', readonly=False)
    mr_accent_color = fields.Char(related='company_id.mr_accent_color', readonly=False)
    mr_background = fields.Selection(related='company_id.mr_background', readonly=False)
    mr_fill_page = fields.Boolean(related='company_id.mr_fill_page', readonly=False)
    mr_show_signatures = fields.Boolean(related='company_id.mr_show_signatures', readonly=False)
    mr_table_style = fields.Selection(related='company_id.mr_table_style', readonly=False)
    mr_table_header = fields.Selection(related='company_id.mr_table_header', readonly=False)
    mr_title_style = fields.Selection(related='company_id.mr_title_style', readonly=False)
    mr_density = fields.Selection(related='company_id.mr_density', readonly=False)
    mr_font_size = fields.Selection(related='company_id.mr_font_size', readonly=False)
    mr_frame = fields.Boolean(related='company_id.mr_frame', readonly=False)
    mr_show_line_numbers = fields.Boolean(related='company_id.mr_show_line_numbers', readonly=False)
    mr_show_amount_words = fields.Boolean(related='company_id.mr_show_amount_words', readonly=False)
    mr_show_payment_methods = fields.Boolean(related='company_id.mr_show_payment_methods', readonly=False)

    def action_mr_payment_methods(self):
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Payment Methods on Documents'),
            'res_model': 'modern.reports.payment.method',
            'view_mode': 'list',
            'domain': [('company_id', '=', self.company_id.id)],
            'context': {'default_company_id': self.company_id.id},
        }
