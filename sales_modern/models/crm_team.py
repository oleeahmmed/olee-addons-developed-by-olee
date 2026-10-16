from odoo import fields, models
from odoo.tools import date_utils

QUOTATION_STATES = ('draft', 'sent')


class CrmTeam(models.Model):
    _inherit = 'crm.team'

    # Figures for the Sales Modern team cards. Computed on the fly (not stored): no new
    # columns, nothing to migrate when Odoo is updated. Amounts come from sale.report,
    # already converted to the company currency.
    sales_modern_quotation_count = fields.Integer('Open quotations', compute='_compute_sales_modern_stats')
    sales_modern_quotation_amount = fields.Monetary('Quoted', compute='_compute_sales_modern_stats', currency_field='currency_id')
    sales_modern_month_amount = fields.Monetary('Sold this month', compute='_compute_sales_modern_stats', currency_field='currency_id')
    sales_modern_member_count = fields.Integer('Salespeople', compute='_compute_sales_modern_stats')

    def _compute_sales_modern_stats(self):
        month_start = date_utils.start_of(fields.Date.context_today(self), 'month')
        Report = self.env['sale.report']

        def by_team(model, domain, aggregate):
            if not self.ids:
                return {}
            return {team.id: value for team, value in model._read_group(
                [('team_id', 'in', self.ids)] + domain, ['team_id'], [aggregate])}

        quote_count = by_team(self.env['sale.order'], [('state', 'in', QUOTATION_STATES)], '__count')
        quote_amount = by_team(Report, [('state', 'in', QUOTATION_STATES)], 'price_subtotal:sum')
        month_amount = by_team(Report, [('state', '=', 'sale'), ('date', '>=', month_start)], 'price_subtotal:sum')
        for team in self:
            team.sales_modern_quotation_count = quote_count.get(team.id, 0)
            team.sales_modern_quotation_amount = quote_amount.get(team.id) or 0.0
            team.sales_modern_month_amount = month_amount.get(team.id) or 0.0
            team.sales_modern_member_count = len(team.member_ids)

    def sales_modern_open_quotations(self):
        """Card button: this team's open quotations on the Sales Modern page."""
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('sales_modern.action_quotations')
        action['context'] = {'sales_modern_team_id': self.id}
        action['display_name'] = self.env._("Quotations · %s", self.display_name)
        return action

    def sales_modern_open_orders(self):
        """Card button: this team's sales orders on the Sales Modern page."""
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('sales_modern.action_orders')
        action['context'] = {'sales_modern_team_id': self.id}
        action['display_name'] = self.env._("Sales Orders · %s", self.display_name)
        return action
