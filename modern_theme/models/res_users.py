import json

from odoo import api, fields, models

from .theme_options import MT_ATTRIBUTES

MAX_FAVORITES = 30


class ResUsers(models.Model):
    _inherit = "res.users"

    mt_sidebar_favorites = fields.Text(
        string="Pinned Menus", help="JSON list of ir.ui.menu ids pinned in the sidebar.",
    )

    @api.model
    def _mt_html_attributes(self, color_scheme="light", cookies=None):
        """Fixed ``data-mt-*`` attributes for <html> (rendered server-side)."""
        cookies = cookies or {}
        attrs = {f"data-mt-{key}": value for key, value in MT_ATTRIBUTES.items()}
        attrs["data-mt-scheme"] = color_scheme
        attrs["data-mt-color"] = (
            self.env["ir.config_parameter"].sudo().get_param("modern_theme.primary_color") or "blue"
        )
        # Per-browser sidebar state (set by the sidebar) so the layout never jumps on load.
        collapsed = cookies.get("mt_sb_collapsed")
        attrs["data-mt-sidebar-collapsed"] = collapsed if collapsed in ("0", "1") else "0"
        attrs["data-mt-sb-pinned"] = "0" if cookies.get("mt_sb_pinned") == "0" else "1"
        return attrs

    def _mt_favorites(self):
        try:
            ids = json.loads(self.sudo().mt_sidebar_favorites or "[]")
        except ValueError:
            ids = []
        return [int(i) for i in ids if isinstance(i, int) or str(i).isdigit()][:MAX_FAVORITES]

    @api.model
    def mt_set_favorites(self, menu_ids):
        ids = [int(i) for i in (menu_ids or []) if str(i).isdigit()][:MAX_FAVORITES]
        self.env.user.sudo().mt_sidebar_favorites = json.dumps(ids)
        return ids

    # ------------------------------------------------------------------
    # Post-login home page (hook kept for crm/sales/inventory/... addons)
    # ------------------------------------------------------------------
    def _modern_theme_login_action(self):
        """App addons override this to pick the post-login screen of ``self`` (one user).

        Return an ir.actions.* record, or empty. Modern Theme itself has no landing
        page; CRM / Sales / Inventory supply theirs (and call super() otherwise).
        """
        return self.env["ir.actions.actions"]

    def _mt_apply_home_action(self, only_empty=True):
        """Give each internal user the landing page its apps ask for."""
        discuss = self.env.ref("mail.action_discuss", raise_if_not_found=False)
        for user in self.filtered(lambda u: not u.share):
            if only_empty and user.action_id and user.action_id != discuss:
                continue  # keep any admin-chosen page
            action = user._modern_theme_login_action()
            if action:
                user.sudo().action_id = action.id

    @api.model
    def _modern_theme_set_default_home_action(self):
        """Fill empty / Discuss Home Action. Keep any admin-chosen page."""
        users = self.sudo().with_context(active_test=False).search([("share", "=", False), ("id", ">", 1)])
        users._mt_apply_home_action()
        return True

    @api.model_create_multi
    def create(self, vals_list):
        users = super().create(vals_list)
        users._mt_apply_home_action()
        return users
