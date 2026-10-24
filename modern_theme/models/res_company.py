import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError

from .theme_options import (
    BOOL_OPTIONS, BORDERS, COLOR_MODES, COLOR_OPTIONS, CONTENT_FRAMES, CONTENT_WIDTHS,
    DENSITIES, FONT_SCALES, FONTS, FORM_STYLES, HEX_RE, LIST_STYLES, LOGIN_STYLES, OPTIONS,
    RADII, SHADOWS, SIDEBAR_BGS, SIDEBAR_STYLES, SIDEBAR_WIDTHS, THEME_PRESETS,
    TOPBAR_HEIGHTS, TOPBAR_STYLES,
)


class ResCompany(models.Model):
    _inherit = "res.company"

    # ---- Modern Theme: company defaults (Settings > Modern Theme) ----------
    mt_color_mode = fields.Selection(COLOR_MODES, string="Color Mode", default="light", required=True)
    mt_preset = fields.Selection(THEME_PRESETS, string="Theme Color", default="once", required=True)
    mt_font = fields.Selection(FONTS, string="Theme Font", default="inter", required=True)
    mt_font_scale = fields.Selection(FONT_SCALES, string="Font Size", default="md", required=True)
    mt_radius = fields.Selection(RADII, string="Corner Radius", default="md", required=True)
    mt_border = fields.Selection(BORDERS, string="Borders", default="subtle", required=True)
    mt_shadow = fields.Selection(SHADOWS, string="Card Shadow", default="sm", required=True)
    mt_density = fields.Selection(DENSITIES, string="Density", default="comfortable", required=True)
    mt_sidebar_style = fields.Selection(SIDEBAR_STYLES, string="Sidebar Style", default="classic", required=True)
    mt_sidebar_bg = fields.Selection(SIDEBAR_BGS, string="Sidebar Background", default="solid", required=True)
    mt_sidebar_width = fields.Selection(SIDEBAR_WIDTHS, string="Sidebar Width", default="normal", required=True)
    mt_topbar_style = fields.Selection(TOPBAR_STYLES, string="Top Bar Style", default="solid", required=True)
    mt_topbar_height = fields.Selection(TOPBAR_HEIGHTS, string="Top Bar Height", default="normal", required=True)
    mt_content_width = fields.Selection(CONTENT_WIDTHS, string="Content Width", default="full", required=True)
    mt_content_frame = fields.Selection(CONTENT_FRAMES, string="Content Frame", default="card", required=True)
    mt_list_style = fields.Selection(LIST_STYLES, string="List Style", default="clean", required=True)
    mt_form_style = fields.Selection(FORM_STYLES, string="Form Style", default="classic", required=True)
    mt_login_style = fields.Selection(LOGIN_STYLES, string="Login Page Style", default="split", required=True)
    mt_sidebar_collapsed = fields.Boolean(string="Sidebar Collapsed", default=False)
    mt_animations = fields.Boolean(string="Animations", default=True)
    mt_primary_color = fields.Char(string="Custom Primary Color", default="#4f46e5")
    mt_accent_color = fields.Char(string="Accent Color")

    mt_login_background = fields.Image(
        "Login Background", max_width=2560, max_height=1600,
        help="Picture shown on the login page (split-screen and centered styles).",
    )
    mt_login_tagline = fields.Char(
        "Login Tagline", translate=True,
        help="Short sentence under the company name on the login page.",
    )

    @api.constrains("mt_primary_color", "mt_accent_color")
    def _check_mt_colors(self):
        for company in self:
            for value in (company.mt_primary_color, company.mt_accent_color):
                if value and not re.match(HEX_RE, value):
                    raise ValidationError(self.env._("Colors must be written as #RRGGBB, e.g. #4f46e5."))

    def _mt_defaults(self):
        """Company defaults as a plain dict (keys without the ``mt_`` prefix)."""
        self.ensure_one()
        values = {key: self[f"mt_{key}"] or default for key, (_sel, default, _u) in OPTIONS.items()}
        values.update({key: bool(self[f"mt_{key}"]) for key in BOOL_OPTIONS})
        values.update({key: self[f"mt_{key}"] or "" for key in COLOR_OPTIONS})
        return values
