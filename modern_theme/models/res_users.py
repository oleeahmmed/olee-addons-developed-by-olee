from odoo import fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    modern_theme_dark_mode = fields.Boolean(
        string="Dark Mode",
        default=False,
        help="Switch this user's own Odoo interface to dark mode. "
             "The theme color is set by the administrator in Settings.",
    )

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + ["modern_theme_dark_mode"]

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ["modern_theme_dark_mode"]
