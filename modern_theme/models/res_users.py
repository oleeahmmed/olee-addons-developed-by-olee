from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

from .theme_presets import THEME_PRESETS


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

    @api.model
    def modern_theme_set_preset(self, preset):
        """Company-wide accent color. Same setting as Settings > Modern Theme."""
        if not self.env.user.has_group("base.group_system"):
            raise AccessError(_("Only administrators can change the company theme color."))
        valid = {key for key, _label in THEME_PRESETS}
        if preset not in valid:
            raise UserError(_("Unknown theme color."))
        self.env["ir.config_parameter"].sudo().set_param("modern_theme.preset", preset)
        return preset

    def _modern_theme_login_action(self):
        """App addons override this to pick the post-login screen.

        Return an ir.actions.* record, or empty. Modern Theme itself has no
        landing page — CRM / Sales / Inventory supply theirs.
        """
        return self.env["ir.actions.actions"]

    @api.model
    def _modern_theme_set_default_home_action(self):
        """Fill empty / Discuss Home Action. Keep any admin-chosen page."""
        action = self._modern_theme_login_action()
        if not action:
            return True
        discuss = self.env.ref("mail.action_discuss", raise_if_not_found=False)
        domain = [
            ("share", "=", False),
            ("id", ">", 1),
            "|",
            ("action_id", "=", False),
            ("action_id", "=", discuss.id if discuss else 0),
        ]
        self.sudo().with_context(active_test=False).search(domain).write({"action_id": action.id})
        return True

    @api.model_create_multi
    def create(self, vals_list):
        users = super().create(vals_list)
        action = self._modern_theme_login_action()
        if not action:
            return users
        targets = users.filtered(lambda u: not u.share and not u.action_id)
        if targets:
            targets.sudo().write({"action_id": action.id})
        return users
