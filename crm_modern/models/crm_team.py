from odoo import fields, models
from odoo.tools import date_utils


class CrmTeam(models.Model):
    _inherit = 'crm.team'

    # Figures shown on the Modern CRM team cards. Computed on the fly (not stored):
    # no new columns, nothing to migrate when Odoo is updated.
    crm_modern_open_count = fields.Integer('Open opportunities', compute='_compute_crm_modern_stats')
    crm_modern_open_amount = fields.Monetary('Open pipeline', compute='_compute_crm_modern_stats', currency_field='currency_id')
    crm_modern_overdue_count = fields.Integer('Overdue opportunities', compute='_compute_crm_modern_stats')
    crm_modern_won_month_amount = fields.Monetary('Won this month', compute='_compute_crm_modern_stats', currency_field='currency_id')
    crm_modern_member_count = fields.Integer('Members', compute='_compute_crm_modern_stats')
    # Sales figures (only filled when the Sales app is installed)
    crm_modern_has_sale = fields.Boolean(compute='_compute_crm_modern_sale_stats')
    crm_modern_invoiced = fields.Monetary('Invoiced this month', compute='_compute_crm_modern_sale_stats', currency_field='currency_id')
    crm_modern_invoiced_target = fields.Monetary('Invoicing target', compute='_compute_crm_modern_sale_stats', currency_field='currency_id')
    crm_modern_order_count = fields.Integer('Sales orders', compute='_compute_crm_modern_sale_stats')

    def _compute_crm_modern_sale_stats(self):
        # sale adds invoiced / invoiced_target / sale_order_count on crm.team
        installed = 'invoiced' in self._fields and 'sale_order_count' in self._fields
        for team in self:
            team.crm_modern_has_sale = installed
            team.crm_modern_invoiced = team['invoiced'] if installed else 0.0
            team.crm_modern_invoiced_target = team['invoiced_target'] if installed else 0.0
            team.crm_modern_order_count = team['sale_order_count'] if installed else 0

    def _compute_crm_modern_stats(self):
        Lead = self.env['crm.lead']
        today = fields.Date.context_today(self)
        month_start = date_utils.start_of(today, 'month')
        base = [('team_id', 'in', self.ids), ('type', '=', 'opportunity')]
        open_domain = base + [('active', '=', True), ('won_status', '=', 'pending')]

        def by_team(domain, aggregate):
            if not self.ids:
                return {}
            return {team.id: value for team, value in Lead._read_group(domain, ['team_id'], [aggregate])}

        open_count = by_team(open_domain, '__count')
        open_amount = by_team(open_domain, 'expected_revenue:sum')
        overdue = by_team(open_domain + [('date_deadline', '<', today)], '__count')
        won = by_team(base + [('won_status', '=', 'won'), ('date_closed', '>=', month_start)], 'expected_revenue:sum')
        for team in self:
            team.crm_modern_open_count = open_count.get(team.id, 0)
            team.crm_modern_open_amount = open_amount.get(team.id) or 0.0
            team.crm_modern_overdue_count = overdue.get(team.id, 0)
            team.crm_modern_won_month_amount = won.get(team.id) or 0.0
            team.crm_modern_member_count = len(team.member_ids)

    def crm_modern_open_pipeline(self):
        """Card button: the Modern CRM pipeline filtered on this team."""
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('crm_modern.action_pipeline')
        action['context'] = {'crm_modern_team_id': self.id}
        action['display_name'] = self.env._("Pipeline · %s", self.display_name)
        return action

    def crm_modern_open_team(self):
        """Card button: the Modern CRM team page (members, targets...)."""
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('crm_modern.action_team')
        action['context'] = {'active_id': self.id}
        return action
