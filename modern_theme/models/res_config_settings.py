from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    # Every Modern Theme company default, editable from Settings > Modern Theme.
    mt_color_mode = fields.Selection(related="company_id.mt_color_mode", readonly=False)
    mt_preset = fields.Selection(related="company_id.mt_preset", readonly=False)
    mt_font = fields.Selection(related="company_id.mt_font", readonly=False)
    mt_font_scale = fields.Selection(related="company_id.mt_font_scale", readonly=False)
    mt_radius = fields.Selection(related="company_id.mt_radius", readonly=False)
    mt_border = fields.Selection(related="company_id.mt_border", readonly=False)
    mt_shadow = fields.Selection(related="company_id.mt_shadow", readonly=False)
    mt_density = fields.Selection(related="company_id.mt_density", readonly=False)
    mt_sidebar_style = fields.Selection(related="company_id.mt_sidebar_style", readonly=False)
    mt_sidebar_bg = fields.Selection(related="company_id.mt_sidebar_bg", readonly=False)
    mt_sidebar_width = fields.Selection(related="company_id.mt_sidebar_width", readonly=False)
    mt_topbar_style = fields.Selection(related="company_id.mt_topbar_style", readonly=False)
    mt_topbar_height = fields.Selection(related="company_id.mt_topbar_height", readonly=False)
    mt_content_width = fields.Selection(related="company_id.mt_content_width", readonly=False)
    mt_content_frame = fields.Selection(related="company_id.mt_content_frame", readonly=False)
    mt_list_style = fields.Selection(related="company_id.mt_list_style", readonly=False)
    mt_form_style = fields.Selection(related="company_id.mt_form_style", readonly=False)
    mt_login_style = fields.Selection(related="company_id.mt_login_style", readonly=False)
    mt_sidebar_collapsed = fields.Boolean(related="company_id.mt_sidebar_collapsed", readonly=False)
    mt_animations = fields.Boolean(related="company_id.mt_animations", readonly=False)
    mt_primary_color = fields.Char(related="company_id.mt_primary_color", readonly=False)
    mt_accent_color = fields.Char(related="company_id.mt_accent_color", readonly=False)
    mt_login_background = fields.Image(related="company_id.mt_login_background", readonly=False)
    mt_login_tagline = fields.Char(related="company_id.mt_login_tagline", readonly=False)
