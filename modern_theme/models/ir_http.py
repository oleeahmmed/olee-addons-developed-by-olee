from odoo import models

from .theme_presets import DEFAULT_PRESET, THEME_PRESETS

VALID_PRESETS = {key for key, _ in THEME_PRESETS}


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    def color_scheme(self):
        user = self.env.user
        if user and not user._is_public() and user.modern_theme_dark_mode:
            return "dark"
        return super().color_scheme()

    def webclient_rendering_context(self):
        context = super().webclient_rendering_context()
        context["modern_theme_preset"] = self._modern_theme_preset()
        return context

    def session_info(self):
        info = super().session_info()
        user = self.env.user
        info["modern_theme"] = {
            "preset": self._modern_theme_preset(),
            "dark_mode": bool(user and not user._is_public() and user.modern_theme_dark_mode),
            "can_change_preset": bool(
                user and not user._is_public() and user.has_group("base.group_system")
            ),
        }
        return info

    def _modern_theme_preset(self):
        preset = self.env["ir.config_parameter"].sudo().get_param(
            "modern_theme.preset", DEFAULT_PRESET
        )
        return preset if preset in VALID_PRESETS else DEFAULT_PRESET
