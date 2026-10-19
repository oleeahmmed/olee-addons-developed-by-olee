from odoo import api, fields, models


class UtmCampaign(models.Model):
    _inherit = 'utm.campaign'

    # Default sales team for CSV upload / new leads from this campaign.
    # Writing it also assigns that team on the campaign's open leads (those the
    # user is allowed to write).
    crm_modern_team_id = fields.Many2one('crm.team', string='Sales Team')
    crm_modern_lead_count = fields.Integer(compute='_compute_crm_modern_counts')
    crm_modern_opportunity_count = fields.Integer(compute='_compute_crm_modern_counts')
    crm_modern_open_count = fields.Integer(compute='_compute_crm_modern_counts')

    def _compute_crm_modern_counts(self):
        Lead = self.env['crm.lead'].with_context(active_test=False)
        stats = {}
        if self.ids:
            for campaign, kind, status, count in Lead._read_group(
                [('campaign_id', 'in', self.ids), '|', ('active', '=', True), ('won_status', '!=', 'pending')],
                ['campaign_id', 'type', 'won_status'],
                ['__count'],
            ):
                row = stats.setdefault(campaign.id, {'lead': 0, 'opp': 0, 'open': 0})
                if kind == 'lead':
                    row['lead'] += count
                else:
                    row['opp'] += count
                    if status == 'pending':
                        row['open'] += count
        for campaign in self:
            row = stats.get(campaign.id) or {}
            campaign.crm_modern_lead_count = row.get('lead', 0)
            campaign.crm_modern_opportunity_count = row.get('opp', 0)
            campaign.crm_modern_open_count = row.get('open', 0)

    def write(self, vals):
        res = super().write(vals)
        if 'crm_modern_team_id' in vals:
            self._crm_modern_assign_team_to_leads()
        return res

    def _crm_modern_assign_team_to_leads(self):
        Lead = self.env['crm.lead']
        if not Lead.has_access('write'):
            return
        for campaign in self:
            if not campaign.crm_modern_team_id:
                continue
            leads = Lead.search([
                ('campaign_id', '=', campaign.id),
                ('active', '=', True),
                ('won_status', '=', 'pending'),
            ]).filtered(lambda lead: lead.has_access('write'))
            if leads:
                leads.write({'team_id': campaign.crm_modern_team_id.id})

    def crm_modern_open_leads(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('crm_modern.action_leads')
        action['context'] = {'crm_modern_campaign_id': self.id}
        action['display_name'] = self.env._("Leads · %s", self.display_name)
        return action

    def crm_modern_open_pipeline(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('crm_modern.action_pipeline')
        action['context'] = {'crm_modern_campaign_id': self.id}
        action['display_name'] = self.env._("Pipeline · %s", self.display_name)
        return action
