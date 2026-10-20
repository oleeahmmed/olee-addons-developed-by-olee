from odoo import api, models


class ResCompany(models.Model):
    _inherit = "res.company"

    @api.model
    def crm_modern_open_company(self):
        """Open the company the user is working in, not the full company list."""
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Company"),
            "res_model": "res.company",
            "res_id": self.env.company.id,
            "view_mode": "form",
            "views": [(False, "form")],
            "target": "current",
        }
