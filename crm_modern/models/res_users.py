from odoo import api, models


class ResUsers(models.Model):
    _inherit = "res.users"

    def _modern_theme_login_action(self):
        return self.env.ref("crm_modern.action_home", raise_if_not_found=False)

    @api.model
    def _crm_modern_set_default_home_action(self):
        for xmlid in (
            "crm_modern.view_users_form_home_action",
            "crm_modern.view_users_preferences_home_action",
        ):
            view = self.env.ref(xmlid, raise_if_not_found=False)
            if view:
                view.unlink()
        return self._modern_theme_set_default_home_action()
