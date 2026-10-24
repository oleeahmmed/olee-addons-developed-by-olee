from odoo import models
from odoo.http import request

from .theme_options import PRESET_SWATCHES, contrast_foreground


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    # ------------------------------------------------------------------
    # Backend web client
    # ------------------------------------------------------------------
    def _mt_values(self):
        user = self.env.user
        if not user or user._is_public():
            return self._mt_public_values()
        return user._mt_effective()

    def color_scheme(self):
        """Pick the CSS bundle (light / dark) on the server, so there is no flash.

        ``auto`` follows the operating system: the browser stores its preference
        in the ``color_scheme`` cookie (see theme_service.js) and we read it here.
        """
        user = self.env.user
        if user and not user._is_public():
            mode = self._mt_values().get("color_mode", "light")
            if mode == "dark":
                return "dark"
            if mode == "light":
                return "light"
            if request and request.httprequest.cookies.get("color_scheme") == "dark":
                return "dark"
            return "light"
        return super().color_scheme()

    def webclient_rendering_context(self):
        context = super().webclient_rendering_context()
        values = self._mt_values()
        context["modern_theme_preset"] = values.get("preset")  # backward compatibility
        context["mt_values"] = values
        attrs = self.env["res.users"]._mt_html_attributes(values, context.get("color_scheme") or self.color_scheme())
        # Per-browser sidebar state (set by the sidebar) so the layout never jumps on load.
        cookies = request.httprequest.cookies if request else {}
        if cookies.get("mt_sb_collapsed") in ("0", "1"):
            attrs["data-mt-sidebar-collapsed"] = cookies["mt_sb_collapsed"]
        attrs["data-mt-sb-pinned"] = "0" if cookies.get("mt_sb_pinned") == "0" else "1"
        context["mt_html_attrs"] = attrs
        values["scheme_color"] = (
            values.get("primary_color") if values.get("preset") == "custom" else PRESET_SWATCHES.get(values.get("preset"))
        ) or "#4f46e5"
        return context

    def session_info(self):
        info = super().session_info()
        user = self.env.user
        if user and not user._is_public() and not user.share:
            theme = self.env["res.users"].mt_get_theme()
            theme["scheme"] = self.color_scheme()
            # Legacy keys still read by older code.
            theme["preset"] = theme["values"]["preset"]
            theme["dark_mode"] = theme["scheme"] == "dark"
            theme["can_change_preset"] = theme["can_admin"]
            theme["css_links"] = self._mt_css_links()
            info["modern_theme"] = theme
        return info

    def _mt_css_links(self):
        """URLs of the light and dark CSS bundles, so the client can switch live."""
        links = {"light": False, "dark": False}
        try:
            debug = bool(request) and "assets" in (request.session.debug or "")
            lang = self.env["res.lang"]._get_data(code=self.env.lang or self.env.user.lang)
            rtl = getattr(lang, "direction", "ltr") == "rtl"
            qweb = self.env["ir.qweb"]
            for key, bundle in (("light", "web.assets_web"), ("dark", "web.assets_web_dark")):
                links[key] = qweb._get_asset_bundle(bundle, css=True, js=False, debug_assets=debug, rtl=rtl).get_link("css")
        except Exception:  # noqa: BLE001 - never block the web client for a nicety
            pass
        return links

    # ------------------------------------------------------------------
    # Login page (public user)
    # ------------------------------------------------------------------
    def _modern_theme_preset(self):
        """Kept for templates written against the previous version."""
        return self.env.company.sudo().mt_preset or "once"

    def _mt_public_values(self):
        values = self.env.company.sudo()._mt_defaults()
        values["primary_fg"] = contrast_foreground(values.get("primary_color") or "#4f46e5")
        values["accent_fg"] = contrast_foreground(values["accent_color"]) if values.get("accent_color") else ""
        return values

    def _mt_login_context(self):
        company = self.env.company.sudo()
        values = self._mt_public_values()
        attrs = self.env["res.users"]._mt_html_attributes(
            values,
            {"dark": "dark", "auto": "auto"}.get(values.get("color_mode"), "light"),
        )
        attrs["style"] = "height: 100%;" + (" " + attrs["style"] if attrs.get("style") else "")
        attrs["data-mt-login"] = values.get("login_style", "split")
        return {
            "attrs": attrs,
            "style": values.get("login_style", "split"),
            "company_name": company.name,
            "tagline": company.mt_login_tagline or "",
            "background": f"/modern_theme/login_background/{company.id}" if company.mt_login_background else "",
            "swatch": PRESET_SWATCHES.get(values.get("preset"), values.get("primary_color") or "#4f46e5"),
        }
