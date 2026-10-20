from odoo import api, models


class ResUsers(models.Model):
    _inherit = "res.users"

    def _crm_modern_home_action(self):
        return self.env.ref("crm_modern.action_home", raise_if_not_found=False)

    @api.model
    def _crm_modern_set_default_home_action(self):
        """Open CRM Home after login instead of Discuss.

        Odoo leaves Home Action empty, then the web client picks the first app
        (Discuss, sequence 5). On a CRM workspace that is the wrong first page.
        Only fill empty / Discuss home actions so a custom choice is kept.
        """
        action = self._crm_modern_home_action()
        if not action:
            return
        discuss = self.env.ref("mail.action_discuss", raise_if_not_found=False)
        domain = [
            ("share", "=", False),
            ("id", ">", 1),
            "|",
            ("action_id", "=", False),
            ("action_id", "=", discuss.id if discuss else 0),
        ]
        self.sudo().with_context(active_test=False).search(domain).write({"action_id": action.id})

    @api.model_create_multi
    def create(self, vals_list):
        users = super().create(vals_list)
        action = self._crm_modern_home_action()
        if not action:
            return users
        targets = users.filtered(lambda u: not u.share and not u.action_id)
        if targets:
            targets.sudo().write({"action_id": action.id})
        return users
