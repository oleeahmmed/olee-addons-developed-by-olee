from odoo import api, models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    @api.model
    def _mt_menu_requirements(self):
        """{menu xmlid: bool}: menus of the modern apps that only make sense when another
        (optional) app is installed. A False value hides the menu everywhere (sidebar,
        command palette, breadcrumbs), exactly like a menu the user has no group for.

        App addons extend it:

            def _mt_menu_requirements(self):
                res = super()._mt_menu_requirements()
                res['customer_modern.menu_customers'] = 'customer_rank' in self.env['res.partner']._fields
                return res
        """
        return {}

    def _load_menus_blacklist(self):
        res = super()._load_menus_blacklist()
        for xmlid, available in self._mt_menu_requirements().items():
            if not available:
                menu = self.env.ref(xmlid, raise_if_not_found=False)
                if menu:
                    res.append(menu.id)
        return res
