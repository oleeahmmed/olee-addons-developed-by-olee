from odoo import models

from .crm_lead_sale import has_sale


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    def _load_menus_blacklist(self):
        """Hide Modern CRM's Quotations / Sales Orders menus until Sales is installed."""
        res = super()._load_menus_blacklist()
        if not has_sale(self.env):
            for xmlid in (
                'crm_modern.menu_quotations',
                'crm_modern.menu_sale_orders',
                'sale_crm.sale_order_menu_quotations_crm',
            ):
                menu = self.env.ref(xmlid, raise_if_not_found=False)
                if menu:
                    res.append(menu.id)
        return res
