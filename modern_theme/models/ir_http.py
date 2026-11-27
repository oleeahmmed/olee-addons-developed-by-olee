from odoo import models
from odoo.http import request

from .theme_options import MT_ATTRIBUTES


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    # ------------------------------------------------------------------
    # Backend web client
    # ------------------------------------------------------------------
    def color_scheme(self):
        """Pick the CSS bundle (light / dark) on the server, so there is no flash.

        The browser stores its choice in the ``color_scheme`` cookie (see
        theme_service.js); the server reads it here and renders that bundle.
        """
        user = self.env.user
        if user and user._is_public():
            return super().color_scheme()
        if request and request.httprequest.cookies.get("color_scheme") == "dark":
            return "dark"
        return "light"

    def webclient_rendering_context(self):
        context = super().webclient_rendering_context()
        scheme = context.get("color_scheme") or self.color_scheme()
        cookies = request.httprequest.cookies if request else {}
        context["mt_html_attrs"] = self.env["res.users"]._mt_html_attributes(scheme, cookies)
        context["modern_theme_preset"] = MT_ATTRIBUTES["theme"]  # backward compatibility
        return context

    def session_info(self):
        info = super().session_info()
        user = self.env.user
        if user and not user._is_public() and not user.share:
            info["modern_theme"] = {
                "enabled": True,
                "scheme": self.color_scheme(),
                "favorites": user._mt_favorites(),
                "css_links": self._mt_css_links(),
            }
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
    # Login page (public user): always the light shadcn card.
    # ------------------------------------------------------------------
    def _mt_login_context(self):
        attrs = {f"data-mt-{key}": value for key, value in MT_ATTRIBUTES.items()}
        attrs.update({"data-mt-scheme": "light", "style": "height: 100%;"})
        return {
            "attrs": attrs,
            "company_name": self.env.company.name,
            "swatch": "#171717",
        }
