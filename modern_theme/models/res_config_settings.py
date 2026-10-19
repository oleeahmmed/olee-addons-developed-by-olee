from odoo import api, fields, models

from .theme_presets import DEFAULT_PRESET, THEME_PRESETS


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    modern_theme_preset = fields.Selection(
        THEME_PRESETS,
        string="Theme Color",
        default=DEFAULT_PRESET,
        config_parameter="modern_theme.preset",
        help="Accent color used across the whole interface, for everyone.",
    )
    modern_theme_dark_mode = fields.Boolean(
        string="Dark mode for me",
        help="Switch your own interface to dark mode. Other users pick their own below the "
             "user menu, independently of this setting.",
    )

    @api.model
    def get_values(self):
        res = super().get_values()
        res["modern_theme_dark_mode"] = self.env.user.modern_theme_dark_mode
        return res

    def set_values(self):
        super().set_values()
        self.env.user.modern_theme_dark_mode = self.modern_theme_dark_mode
