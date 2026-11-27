from odoo import fields, models

# shadcn/ui colour themes; the stylesheet keys on html[data-mt-color].
MT_COLORS = [
    ("blue", "Blue"),
    ("neutral", "Neutral"),
    ("green", "Green"),
    ("orange", "Orange"),
    ("rose", "Rose"),
    ("red", "Red"),
    ("violet", "Violet"),
    ("yellow", "Yellow"),
]
MT_COLOR_PARAM = "modern_theme.primary_color"
MT_COLOR_DEFAULT = "blue"


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    mt_primary_color = fields.Selection(
        MT_COLORS, string="Theme color", default=MT_COLOR_DEFAULT,
        config_parameter=MT_COLOR_PARAM,
        help="Primary colour of buttons, links, active menus and the POS counter, in light and dark.",
    )
