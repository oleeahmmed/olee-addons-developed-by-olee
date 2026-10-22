from odoo import api, models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    @api.model
    def _mt_menu_requirements(self):
        # Customers / Vendors are told apart by Invoicing (account): without it there is
        # no customer or vendor rank, so these two pages are simply not shown.
        res = super()._mt_menu_requirements()
        has_ranks = 'customer_rank' in self.env['res.partner']._fields
        res['customer_modern.menu_customers'] = has_ranks
        res['customer_modern.menu_vendors'] = has_ranks
        return res
