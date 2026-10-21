from odoo import http
from odoo.http import request


class ModernThemeController(http.Controller):

    @http.route("/modern_theme/login_background/<int:company_id>", type="http", auth="public", readonly=True)
    def login_background(self, company_id, **kwargs):
        """Public picture for the login page (the company record itself stays private)."""
        company = request.env["res.company"].sudo().browse(company_id).exists()
        if not company or not company.mt_login_background:
            return request.not_found()
        stream = request.env["ir.binary"]._get_image_stream_from(company, "mt_login_background")
        return stream.get_response(max_age=86400)
