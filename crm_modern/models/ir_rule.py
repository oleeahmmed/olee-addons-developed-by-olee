from odoo import api, models


class IrRule(models.Model):
    _inherit = "ir.rule"

    def _register_hook(self):
        """Sales may be installed after CRM Modern: add the team rules then too."""
        super()._register_hook()
        try:
            self._crm_modern_ensure_sale_team_rules()
        except Exception:  # noqa: BLE001 - never block the registry for an optional rule
            pass

    @api.model
    def _crm_modern_ensure_sale_team_rules(self):
        """Create Team Documents rules on sale.order when Sales is installed."""
        if "sale.order" not in self.env:
            return True
        team_group = self.env.ref(
            "crm_modern.group_sale_team_documents", raise_if_not_found=False
        )
        if not team_group:
            return True
        team_domain = (
            "['|', ('team_id.member_ids', 'in', [user.id]), "
            "('team_id.user_id', '=', user.id)]"
        )
        line_domain = (
            "['|', ('order_id.team_id.member_ids', 'in', [user.id]), "
            "('order_id.team_id.user_id', '=', user.id)]"
        )
        specs = [
            ("crm_modern.sale_order_team_rule", "sale.order", "Team Orders", team_domain),
            ("crm_modern.sale_order_line_team_rule", "sale.order.line", "Team Order Lines", line_domain),
            ("crm_modern.sale_order_report_team_rule", "sale.report", "Team Orders Analysis", team_domain),
        ]
        Rule = self.sudo()
        for xmlid, model_name, name, domain in specs:
            if model_name not in self.env:
                continue
            model = self.env["ir.model"]._get(model_name)
            if not model:
                continue
            existing = self.env.ref(xmlid, raise_if_not_found=False)
            vals = {
                "name": name,
                "model_id": model.id,
                "domain_force": domain,
                "groups": [(6, 0, [team_group.id])],
            }
            if existing:
                # Only write when something changed (this also runs at every server start).
                if existing.domain_force != domain or existing.groups != team_group or existing.model_id != model:
                    existing.sudo().write(vals)
            else:
                rule = Rule.create(vals)
                self.env["ir.model.data"].sudo().create({
                    "name": xmlid.split(".", 1)[1],
                    "module": "crm_modern",
                    "model": "ir.rule",
                    "res_id": rule.id,
                    "noupdate": True,
                })
        return True
