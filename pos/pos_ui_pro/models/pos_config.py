from odoo import api, fields, models

BUSINESS_TYPES = [
    ("restaurant", "Restaurant / Bar"),
    ("cafe", "Cafe / Coffee Shop"),
    ("fastfood", "Fast Food / Food Truck"),
    ("bakery", "Bakery / Pastry Shop"),
    ("retail", "Retail Shop / General Store"),
    ("grocery", "Supermarket / Grocery"),
    ("fashion", "Clothing / Boutique / Electronics"),
    ("pharmacy", "Pharmacy / Cosmetics"),
]
POS_STYLES = [
    ("cart", "Cart: product grid with a cart on the right"),
    ("bill", "Bill: order lines as a bill table, scan or type to add"),
]
THEME_COLORS = [
    ("blue", "Blue"), ("neutral", "Neutral"), ("zinc", "Zinc"), ("green", "Green"),
    ("orange", "Orange"), ("rose", "Rose"), ("violet", "Violet"), ("yellow", "Yellow"),
]
# Business types that run on Odoo's own table / kitchen features.
TABLE_SERVICE = {"restaurant"}


class PosConfig(models.Model):
    _inherit = "pos.config"

    pux_business_type = fields.Selection(
        BUSINESS_TYPES, string="Business type", default="retail", required=True,
        help="Chooses the POS screen layout. Restaurant / Bar also switches on Odoo's "
             "table service (floor plan, kitchen orders).",
    )

    pux_pos_style = fields.Selection(
        POS_STYLES, string="POS style", default="cart", required=True,
        help="Default screen style. Cashiers can switch between Cart and Bill on the POS top bar.",
    )
    pux_theme_color = fields.Selection(
        THEME_COLORS, string="Theme color", default="blue", required=True,
        help="Primary colour of the POS (shadcn/ui themes). Light/dark is switched on the POS top bar.",
    )

    def write(self, vals):
        if "pux_business_type" in vals and "module_pos_restaurant" not in vals:
            vals = dict(vals, module_pos_restaurant=vals["pux_business_type"] in TABLE_SERVICE)
        return super().write(vals)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if "pux_business_type" not in vals and vals.get("module_pos_restaurant"):
                vals["pux_business_type"] = "restaurant"
        return super().create(vals_list)


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    pos_pux_business_type = fields.Selection(
        related="pos_config_id.pux_business_type", readonly=False, string="Business type"
    )

    pos_pux_pos_style = fields.Selection(related="pos_config_id.pux_pos_style", readonly=False)
    pos_pux_theme_color = fields.Selection(related="pos_config_id.pux_theme_color", readonly=False)

    @api.onchange("pos_pux_business_type")
    def _onchange_pos_pux_business_type(self):
        if self.pos_pux_business_type:
            self.pos_module_pos_restaurant = self.pos_pux_business_type in TABLE_SERVICE
