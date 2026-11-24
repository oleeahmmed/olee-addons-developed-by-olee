from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    mr_doc_accent_color = fields.Char(
        related='company_id.mr_doc_accent_color', readonly=False,
    )
    mr_doc_background = fields.Selection(
        related='company_id.mr_doc_background', readonly=False,
    )
    mr_doc_background_color = fields.Char(
        related='company_id.mr_doc_background_color', readonly=False,
    )
