import json
import re

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

from .theme_options import (
    BOOL_OPTIONS, BORDERS, COLOR_MODES, COLOR_OPTIONS, CONTENT_FRAMES, CONTENT_WIDTHS,
    DENSITIES, FONT_SCALES, FONTS, FORM_STYLES, HEX_RE, LIST_STYLES, OPTIONS, PRESET_SWATCHES,
    RADII, SHADOWS, SIDEBAR_APP_MENUS, SIDEBAR_BGS, SIDEBAR_STYLES, SIDEBAR_WIDTHS, THEME_PRESETS,
    TOPBAR_HEIGHTS, TOPBAR_STYLES, contrast_foreground, selection_keys,
)

MAX_FAVORITES = 30


class ResUsers(models.Model):
    _inherit = "res.users"

    # ---- Modern Theme: personal overrides (empty = company default) --------
    mt_color_mode = fields.Selection(COLOR_MODES, string="Color Mode", help="Empty = company default.")
    mt_preset = fields.Selection(THEME_PRESETS, string="Theme Color", help="Empty = company default.")
    mt_font = fields.Selection(FONTS, string="Theme Font", help="Empty = company default.")
    mt_font_scale = fields.Selection(FONT_SCALES, string="Font Size", help="Empty = company default.")
    mt_radius = fields.Selection(RADII, string="Corner Radius", help="Empty = company default.")
    mt_border = fields.Selection(BORDERS, string="Borders", help="Empty = company default.")
    mt_shadow = fields.Selection(SHADOWS, string="Card Shadow", help="Empty = company default.")
    mt_density = fields.Selection(DENSITIES, string="Density", help="Empty = company default.")
    mt_sidebar_style = fields.Selection(SIDEBAR_STYLES, string="Sidebar Style", help="Empty = company default.")
    mt_sidebar_bg = fields.Selection(SIDEBAR_BGS, string="Sidebar Background", help="Empty = company default.")
    mt_sidebar_width = fields.Selection(SIDEBAR_WIDTHS, string="Sidebar Width", help="Empty = company default.")
    mt_sidebar_app_menu = fields.Selection(SIDEBAR_APP_MENUS, string="Current App Menu", help="Empty = company default.")
    mt_topbar_style = fields.Selection(TOPBAR_STYLES, string="Top Bar Style", help="Empty = company default.")
    mt_topbar_height = fields.Selection(TOPBAR_HEIGHTS, string="Top Bar Height", help="Empty = company default.")
    mt_content_width = fields.Selection(CONTENT_WIDTHS, string="Content Width", help="Empty = company default.")
    mt_content_frame = fields.Selection(CONTENT_FRAMES, string="Content Frame", help="Empty = company default.")
    mt_list_style = fields.Selection(LIST_STYLES, string="List Style", help="Empty = company default.")
    mt_form_style = fields.Selection(FORM_STYLES, string="Form Style", help="Empty = company default.")
    mt_sidebar_collapsed = fields.Selection([("yes", "On"), ("no", "Off")], string="Sidebar Collapsed", help="Empty = company default.")
    mt_animations = fields.Selection([("yes", "On"), ("no", "Off")], string="Animations", help="Empty = company default.")
    mt_primary_color = fields.Char(string="Custom Primary Color", help="Empty = company default.")
    mt_accent_color = fields.Char(string="Accent Color", help="Empty = company default.")
    mt_sidebar_favorites = fields.Text(
        string="Pinned Menus", help="JSON list of ir.ui.menu ids pinned in the sidebar.",
    )

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + self._mt_user_field_names()

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + self._mt_user_field_names()

    @api.model
    def _mt_user_field_names(self):
        names = [f"mt_{key}" for key, (_s, _d, user) in OPTIONS.items() if user]
        names += [f"mt_{key}" for key, (_d, user) in BOOL_OPTIONS.items() if user]
        names += [f"mt_{key}" for key in COLOR_OPTIONS]
        return names + ["mt_sidebar_favorites"]

    # ------------------------------------------------------------------
    # Effective values
    # ------------------------------------------------------------------
    def _mt_effective(self, company=None):
        """Merge company defaults with this user's overrides.

        Returns a dict ``{key: value}`` for every option plus a few derived
        entries (``primary_fg``, ``dark``) used by the templates.
        """
        user = self[:1]
        company = company or user.company_id or self.env.company
        values = company.sudo()._mt_defaults()
        if user and not user._is_public():
            data = user.sudo()
            for key, (_sel, _default, overridable) in OPTIONS.items():
                if overridable and data[f"mt_{key}"]:
                    values[key] = data[f"mt_{key}"]
            for key, (_default, overridable) in BOOL_OPTIONS.items():
                if overridable and data[f"mt_{key}"]:
                    values[key] = data[f"mt_{key}"] == "yes"
            for key in COLOR_OPTIONS:
                if data[f"mt_{key}"]:
                    values[key] = data[f"mt_{key}"]
        values["primary_fg"] = contrast_foreground(values.get("primary_color") or "#4f46e5")
        values["accent_fg"] = contrast_foreground(values["accent_color"]) if values.get("accent_color") else ""
        return values

    @api.model
    def _mt_html_attributes(self, values, color_scheme="light"):
        """``data-mt-*`` attributes + inline custom properties for <html>."""
        attrs = {f"data-mt-{key.replace('_', '-')}": values[key] for key in OPTIONS if key not in ("login_style",)}
        attrs["data-mt-theme"] = values["preset"]  # historical name, used by every addon
        attrs["data-mt-sidebar-collapsed"] = "1" if values.get("sidebar_collapsed") else "0"
        attrs["data-mt-animations"] = "on" if values.get("animations") else "off"
        attrs["data-mt-scheme"] = color_scheme
        style = []
        if values["preset"] == "custom" and values.get("primary_color"):
            hex_color = values["primary_color"].lstrip("#")
            rgb = ", ".join(str(int(hex_color[i:i + 2], 16)) for i in (0, 2, 4))
            style += [
                f"--mt-custom-primary: {values['primary_color']}",
                f"--mt-custom-primary-fg: {values['primary_fg']}",
                f"--mt-custom-primary-rgb: {rgb}",
            ]
        if values.get("accent_color"):
            style += [f"--mt-custom-accent: {values['accent_color']}", f"--mt-custom-accent-fg: {values['accent_fg']}"]
            attrs["data-mt-accent"] = "custom"
        if style:
            attrs["style"] = "; ".join(style)
        return attrs

    @api.model
    def mt_get_theme(self):
        """Everything the client needs to (re)apply the theme."""
        user = self.env.user
        company = self.env.company
        is_admin = user.has_group("base.group_system")
        return {
            "values": user._mt_effective(company),
            "company": company.sudo()._mt_defaults(),
            "user": {
                key: user[f"mt_{key}"] or False
                for key in [*OPTIONS, *BOOL_OPTIONS, *COLOR_OPTIONS]
                if f"mt_{key}" in user._fields
            },
            "favorites": user._mt_favorites(),
            "can_admin": is_admin,
            "swatches": PRESET_SWATCHES,
        }

    # ------------------------------------------------------------------
    # RPC used by the topbar switcher / sidebar / settings tools
    # ------------------------------------------------------------------
    @api.model
    def _mt_clean(self, vals, for_company=False):
        clean = {}
        for key, value in (vals or {}).items():
            if key in OPTIONS:
                if for_company or OPTIONS[key][2]:
                    if value in (False, None, "") and not for_company:
                        clean[f"mt_{key}"] = False
                    elif value in selection_keys(key):
                        clean[f"mt_{key}"] = value
                    else:
                        raise UserError(_("Invalid value %(value)s for %(key)s.", value=value, key=key))
            elif key in BOOL_OPTIONS:
                if for_company:
                    clean[f"mt_{key}"] = bool(value)
                elif BOOL_OPTIONS[key][1]:
                    clean[f"mt_{key}"] = False if value in (None, "") else ("yes" if value in (True, "yes") else "no")
            elif key in COLOR_OPTIONS:
                if value and not re.match(HEX_RE, value):
                    raise UserError(_("Colors must be written as #RRGGBB."))
                clean[f"mt_{key}"] = value or False
        return clean

    @api.model
    def mt_set_appearance(self, vals):
        """Save the current user's personal overrides. ``False`` = back to company default."""
        user = self.env.user
        if user._is_public():
            raise AccessError(_("Please log in first."))
        user.sudo().write(self._mt_clean(vals))
        return self.mt_get_theme()

    @api.model
    def mt_reset_appearance(self):
        """Forget every personal override of the current user."""
        self.env.user.sudo().write({name: False for name in self._mt_user_field_names() if name != "mt_sidebar_favorites"})
        return self.mt_get_theme()

    @api.model
    def mt_set_company_appearance(self, vals):
        """Save company defaults (administrators only), e.g. from a JSON import."""
        if not self.env.user.has_group("base.group_system"):
            raise AccessError(_("Only administrators can change the company theme."))
        self.env.company.write(self._mt_clean(vals, for_company=True))
        return self.mt_get_theme()

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

    # Backward compatibility: the old systray toggle and other addons may still call this.
    @api.model
    def modern_theme_set_preset(self, preset):
        self.mt_set_company_appearance({"preset": preset})
        return preset

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
