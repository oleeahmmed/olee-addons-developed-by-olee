from odoo import api, models
from odoo.exceptions import AccessError, UserError


SALE_ACCESS_LEVELS = ("none", "own", "team", "all")


class ResUsers(models.Model):
    _inherit = "res.users"

    def _modern_theme_login_action(self):
        """CRM Home after login, for CRM users only (others keep their apps' page)."""
        action = self.env.ref("crm_modern.action_home", raise_if_not_found=False)
        if action and len(self) == 1 and self.has_group("sales_team.group_sale_salesman"):
            return action
        return super()._modern_theme_login_action()

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

    @api.model
    def _crm_modern_sales_privilege_groups(self):
        """Stock Sales privilege groups + Team Documents, highest last."""
        refs = (
            "sales_team.group_sale_salesman",
            "crm_modern.group_sale_team_documents",
            "sales_team.group_sale_salesman_all_leads",
            "sales_team.group_sale_manager",
        )
        groups = self.env["res.groups"]
        for xmlid in refs:
            group = self.env.ref(xmlid, raise_if_not_found=False)
            if group:
                groups |= group
        return groups

    def _crm_modern_get_sale_access(self):
        """Map the user's Sales privilege group to a CRM level."""
        self.ensure_one()
        held = self.all_group_ids
        team = self.env.ref("crm_modern.group_sale_team_documents", raise_if_not_found=False)
        all_docs = self.env.ref("sales_team.group_sale_salesman_all_leads", raise_if_not_found=False)
        own = self.env.ref("sales_team.group_sale_salesman", raise_if_not_found=False)
        # All Documents / Administrator both map to "all" in the CRM picker.
        if all_docs and all_docs in held:
            return "all"
        if team and team in held:
            return "team"
        if own and own in held:
            return "own"
        return "none"

    def _crm_modern_set_sale_access(self, level):
        """Assign exactly one Sales privilege level (Odoo radio semantics)."""
        self.ensure_one()
        level = (level or "none").strip().lower()
        if level not in SALE_ACCESS_LEVELS:
            raise UserError(self.env._("Unknown sales document access level."))

        privilege_groups = self._crm_modern_sales_privilege_groups()
        own = self.env.ref("sales_team.group_sale_salesman", raise_if_not_found=False)
        team = self.env.ref("crm_modern.group_sale_team_documents", raise_if_not_found=False)
        all_docs = self.env.ref("sales_team.group_sale_salesman_all_leads", raise_if_not_found=False)
        manager = self.env.ref("sales_team.group_sale_manager", raise_if_not_found=False)

        target = self.env["res.groups"]
        if level == "own" and own:
            target = own
        elif level == "team" and team:
            target = team
        elif level == "all":
            # Keep Administrator if they already have it; otherwise All Documents.
            if manager and manager in self.all_group_ids:
                target = manager
            elif all_docs:
                target = all_docs

        commands = [(3, g.id) for g in privilege_groups]
        if target:
            commands.append((4, target.id))
        if commands:
            self.sudo().write({"group_ids": commands})

    def crm_modern_user_form(self):
        self.ensure_one()
        self._crm_modern_assert_user_manager()
        sale_access = self._crm_modern_get_sale_access()
        team = self.env["crm.team"].search([("member_ids", "in", self.id)], limit=1)
        return {
            "id": self.id,
            "name": self.name,
            "login": self.login,
            "active": bool(self.active),
            "sale_access": sale_access,
            # Kept for older callers / MemberDialog defaults.
            "is_salesperson": sale_access != "none",
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
        sale_access = vals.get("sale_access")
        if sale_access is None:
            sale_access = "own" if vals.get("is_salesperson") else "none"
        user._crm_modern_set_sale_access(sale_access)
        team_id = int(vals.get("team_id") or 0)
        if team_id and sale_access != "none":
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

        if "sale_access" in vals:
            self._crm_modern_set_sale_access(vals.get("sale_access"))
        elif "is_salesperson" in vals:
            self._crm_modern_set_sale_access("own" if vals.get("is_salesperson") else "none")

        sale_access = self._crm_modern_get_sale_access()
        team_id = vals.get("team_id")
        if team_id and sale_access != "none":
            team = self.env["crm.team"].browse(int(team_id))
            if team.exists() and self.id not in team.member_ids.ids:
                team.write({"member_ids": [(4, self.id)]})
        return True
