from odoo import api, models
from odoo.exceptions import AccessError, UserError


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

    def _crm_modern_assert_user_manager(self):
        if not self.env.user.has_group("base.group_erp_manager"):
            raise AccessError(self.env._("Only administrators can add or edit users."))

    def crm_modern_user_form(self):
        self.ensure_one()
        self._crm_modern_assert_user_manager()
        salesman = self.env.ref("sales_team.group_sale_salesman", raise_if_not_found=False)
        team = self.env["crm.team"].search([("member_ids", "in", self.id)], limit=1)
        return {
            "id": self.id,
            "name": self.name,
            "login": self.login,
            "active": bool(self.active),
            "is_salesperson": bool(salesman and salesman in self.all_group_ids),
            "team_id": team.id if team else False,
        }

    @api.model
    def crm_modern_create_user(self, vals):
        """Create an internal login from the CRM workspace (not the default Users form)."""
        self._crm_modern_assert_user_manager()
        self.check_access("create")
        vals = vals or {}
        name = (vals.get("name") or "").strip()
        login = (vals.get("login") or "").strip()
        password = vals.get("password") or ""
        if not name:
            raise UserError(self.env._("Give the person a name."))
        if not login:
            raise UserError(self.env._("Give them an email to log in with."))
        if not password:
            raise UserError(self.env._("Set a password so they can log in."))
        if self.sudo().search_count([("login", "=", login)], limit=1):
            raise UserError(self.env._("That login is already used."))
        user = self.with_context(no_reset_password=True).create({
            "name": name,
            "login": login,
            "email": login,
            "password": password,
        })
        if vals.get("is_salesperson"):
            salesman = self.env.ref("sales_team.group_sale_salesman", raise_if_not_found=False)
            if salesman:
                user.sudo().write({"group_ids": [(4, salesman.id)]})
        team_id = int(vals.get("team_id") or 0)
        if team_id:
            team = self.env["crm.team"].browse(team_id)
            if team.exists():
                team.write({"member_ids": [(4, user.id)]})
        home = self.env.ref("crm_modern.action_home", raise_if_not_found=False)
        if home:
            user.action_id = home.id
        return user.id

    def crm_modern_write_user(self, vals):
        self.ensure_one()
        self._crm_modern_assert_user_manager()
        self.check_access("write")
        vals = vals or {}
        write_vals = {}
        if "name" in vals:
            name = (vals.get("name") or "").strip()
            if not name:
                raise UserError(self.env._("Give the person a name."))
            write_vals["name"] = name
        if "login" in vals:
            login = (vals.get("login") or "").strip()
            if not login:
                raise UserError(self.env._("Give them an email to log in with."))
            if self.sudo().search_count([("login", "=", login), ("id", "!=", self.id)], limit=1):
                raise UserError(self.env._("That login is already used."))
            write_vals["login"] = login
            write_vals["email"] = login
        if "active" in vals:
            write_vals["active"] = bool(vals.get("active"))
        if vals.get("password"):
            write_vals["password"] = vals["password"]
        if write_vals:
            self.with_context(no_reset_password=True).write(write_vals)
        if "is_salesperson" in vals:
            salesman = self.env.ref("sales_team.group_sale_salesman", raise_if_not_found=False)
            if salesman:
                self.sudo().write({"group_ids": [(4 if vals.get("is_salesperson") else 3, salesman.id)]})
        team_id = vals.get("team_id")
        if team_id:
            team = self.env["crm.team"].browse(int(team_id))
            if team.exists() and self.id not in team.member_ids.ids:
                team.write({"member_ids": [(4, self.id)]})
        return True
