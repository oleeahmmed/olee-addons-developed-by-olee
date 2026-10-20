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

    def _crm_modern_lead_context(self):
        self.ensure_one()
        ctx = {'crm_modern_campaign_id': self.id}
        if self.crm_modern_team_id:
            ctx['crm_modern_team_id'] = self.crm_modern_team_id.id
        return ctx

    def crm_modern_open(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('crm_modern.action_campaign')
        action['context'] = {'active_id': self.id, 'crm_modern_campaign_id': self.id}
        action['display_name'] = self.display_name
        return action

    def crm_modern_open_leads(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('crm_modern.action_leads')
        action['context'] = self._crm_modern_lead_context()
        action['display_name'] = self.env._("Leads · %s", self.display_name)
        return action

    def crm_modern_open_pipeline(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('crm_modern.action_pipeline')
        action['context'] = self._crm_modern_lead_context()
        action['display_name'] = self.env._("Pipeline · %s", self.display_name)
        return action

    def crm_modern_campaign_detail(self):
        """Everything the campaign page needs in one round trip."""
        self.ensure_one()
        Lead = self.env['crm.lead']
        features = Lead.crm_modern_features()
        return {
            'campaign': {
                'id': self.id,
                'title': self.title,
                'active': self.active,
                'user_id': [self.user_id.id, self.user_id.display_name] if self.user_id else False,
                'team_id': [self.crm_modern_team_id.id, self.crm_modern_team_id.display_name] if self.crm_modern_team_id else False,
                'stage_id': [self.stage_id.id, self.stage_id.display_name] if self.stage_id else False,
                'tag_ids': [{'id': tag.id, 'name': tag.name, 'color': tag.color} for tag in self.tag_ids],
                'lead_count': self.crm_modern_lead_count,
                'opportunity_count': self.crm_modern_opportunity_count,
                'open_count': self.crm_modern_open_count,
            },
            'stages': self.env['utm.stage'].search_read([], ['name'], order='sequence, id'),
            'users': self.env['res.users'].search_read([('share', '=', False)], ['name'], order='name'),
            'teams': self.env['crm.team'].search_read([], ['name'], order='sequence, name'),
            'tags': self.env['utm.tag'].search_read([], ['name', 'color'], order='name'),
            'use_leads': bool(features.get('use_leads')),
            'can_edit': self.has_access('write'),
            'can_create_lead': Lead.has_access('create'),
        }
