import re
from datetime import timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.tools import date_utils, plaintext2html


# Won / lost deals are archived or not depending on settings; open ("pending") deals
# only count while active, so archived ones never inflate the pipeline.
LIVE_OR_CLOSED = ['|', ('active', '=', True), ('won_status', '!=', 'pending')]


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    # ------------------------------------------------------------------
    # Dashboard / statistics (read-only aggregations, no stored data)
    # ------------------------------------------------------------------

    @api.model
    def crm_modern_features(self):
        """What the Modern CRM UI should show for the current user.

        ``use_leads`` follows CRM ▸ Settings ▸ Leads. ``sale`` is False here and
        turned on by the crm_modern_sale bridge when Sales is installed.
        """
        return {
            'use_leads': self.env.user.has_group('crm.group_use_lead'),
            'sale': False,
        }

    @api.model
    def crm_modern_dashboard(self):
        """Everything the dashboard needs in one round trip."""
        Lead = self.with_context(active_test=False)
        today = fields.Date.context_today(self)
        month_start = date_utils.start_of(today, 'month')
        opp = [('type', '=', 'opportunity')]

        def total(domain, field='expected_revenue'):
            [(count, amount)] = Lead._read_group(domain, aggregates=['__count', f'{field}:sum'])
            return count, amount or 0.0

        open_domain = opp + [('active', '=', True), ('won_status', '=', 'pending')]
        open_count, pipeline = total(open_domain)
        _count, weighted = total(open_domain, 'prorated_revenue')
        won_count, won_month = total(opp + [('won_status', '=', 'won'), ('date_closed', '>=', month_start)])

        since = today - timedelta(days=90)
        closed = dict(Lead._read_group(
            opp + [('won_status', 'in', ('won', 'lost')), ('date_closed', '>=', since)],
            ['won_status'], ['__count']))
        decided = closed.get('won', 0) + closed.get('lost', 0)
        new_leads = self.search_count([('type', '=', 'lead'), ('create_date', '>=', today - timedelta(days=7))])

        trend_start = month_start - relativedelta(months=5)
        by_month = {
            month.date() if hasattr(month, 'date') else month: amount or 0.0
            for month, amount in Lead._read_group(
                opp + [('won_status', '=', 'won'), ('date_closed', '>=', trend_start)],
                ['date_closed:month'], ['expected_revenue:sum'])
        }
        trend = []
        for i in range(6):
            month = trend_start + relativedelta(months=i)
            trend.append({'label': month.strftime('%b'), 'value': by_month.get(month, 0.0)})

        stages = self.env['crm.stage'].search([])
        per_stage = {
            stage.id: (count, amount or 0.0)
            for stage, count, amount in self._read_group(
                opp + [('won_status', '!=', 'lost')], ['stage_id'], ['__count', 'expected_revenue:sum'])
        }
        by_stage = [{
            'id': s.id, 'label': s.name,
            'count': per_stage.get(s.id, (0, 0.0))[0], 'value': per_stage.get(s.id, (0, 0.0))[1],
        } for s in stages]

        leaderboard = self._crm_modern_user_stats(limit=5)

        campaigns = self.env['utm.campaign'].search_read(
            [('simple_card_count', '>', 0)],
            ['title', 'simple_team_id', 'user_id', 'simple_lead_count', 'simple_opportunity_count',
             'simple_open_count', 'simple_won_count', 'simple_won_revenue'],
            order='simple_card_count desc', limit=6)

        return {
            'currency_id': self.env.company.currency_id.id,
            'kpis': {
                'pipeline': pipeline, 'weighted': weighted, 'open_count': open_count,
                'won_month': won_month, 'won_month_count': won_count,
                'win_rate': round(closed.get('won', 0) * 100 / decided) if decided else 0,
                'new_leads': new_leads,
            },
            'trend': trend,
            'by_stage': by_stage,
            'leaderboard': leaderboard,
            'campaigns': campaigns,
        }

    @api.model
    def _crm_modern_user_stats(self, user_ids=None, limit=None):
        Lead = self.with_context(active_test=False)
        domain = [('type', '=', 'opportunity'), ('user_id', '!=', False)] + LIVE_OR_CLOSED
        if user_ids is not None:
            domain.append(('user_id', 'in', user_ids))
        stats = {}
        for user, status, count, amount in Lead._read_group(
                domain, ['user_id', 'won_status'], ['__count', 'expected_revenue:sum']):
            row = stats.setdefault(user.id, {
                'user_id': user.id, 'name': user.name,
                'open_count': 0, 'pipeline': 0.0, 'won_count': 0, 'won': 0.0, 'lost_count': 0,
            })
            if status == 'won':
                row['won_count'] += count
                row['won'] += amount or 0.0
            elif status == 'lost':
                row['lost_count'] += count
            else:
                row['open_count'] += count
                row['pipeline'] += amount or 0.0
        overdue = dict(self.env['mail.activity']._read_group(
            [('res_model', '=', 'crm.lead'), ('date_deadline', '<', fields.Date.context_today(self))]
            + ([('user_id', 'in', user_ids)] if user_ids is not None else []),
            ['user_id'], ['__count']))
        rows = list(stats.values())
        for row in rows:
            decided = row['won_count'] + row['lost_count']
            row['win_rate'] = round(row['won_count'] * 100 / decided) if decided else None
            row['overdue'] = next((c for u, c in overdue.items() if u.id == row['user_id']), 0)
        rows.sort(key=lambda r: (r['won'] + r['pipeline'] * 0.3), reverse=True)
        return rows[:limit] if limit else rows

    @api.model
    def crm_modern_team_detail(self, team_id):
        """One sales team with its member lines and each member's results inside the team."""
        team = self.env['crm.team'].browse(team_id).exists()
        if not team:
            return False
        [vals] = team.read([
            'name', 'user_id', 'alias_name', 'alias_email', 'use_leads', 'use_opportunities',
            'assignment_optout', 'company_id', 'active', 'member_warning', 'is_membership_multi',
        ])
        members = self.env['crm.team.member'].search_read(
            [('crm_team_id', '=', team.id)],
            ['user_id', 'email', 'phone', 'assignment_max', 'assignment_optout', 'lead_month_count'],
            order='id')
        user_ids = [m['user_id'][0] for m in members if m['user_id']]
        stats = {}
        Lead = self.with_context(active_test=False)
        for user, status, count, amount in Lead._read_group(
                [('type', '=', 'opportunity'), ('team_id', '=', team.id), ('user_id', 'in', user_ids)] + LIVE_OR_CLOSED,
                ['user_id', 'won_status'], ['__count', 'expected_revenue:sum']):
            row = stats.setdefault(user.id, {'open_count': 0, 'pipeline': 0.0, 'won_count': 0, 'won': 0.0})
            if status == 'won':
                row['won_count'] += count
                row['won'] += amount or 0.0
            elif status == 'pending':
                row['open_count'] += count
                row['pipeline'] += amount or 0.0
        empty = {'open_count': 0, 'pipeline': 0.0, 'won_count': 0, 'won': 0.0}
        for m in members:
            m.update(stats.get(m['user_id'] and m['user_id'][0], empty))
        # Team totals cover every opportunity of the team (also unassigned or ex-members),
        # so they match the numbers on the Sales Teams cards.
        totals = dict(empty)
        for status, count, amount in Lead._read_group(
                [('type', '=', 'opportunity'), ('team_id', '=', team.id)] + LIVE_OR_CLOSED,
                ['won_status'], ['__count', 'expected_revenue:sum']):
            if status == 'won':
                totals['won_count'] += count
                totals['won'] += amount or 0.0
            elif status == 'pending':
                totals['open_count'] += count
                totals['pipeline'] += amount or 0.0
        return {'currency_id': self.env.company.currency_id.id, 'team': vals, 'members': members, 'totals': totals}

    @api.model
    def crm_modern_view_ids(self):
        """Database ids of the native views embedded in the modern pages."""
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False
        return {
            'campaign_search': ref('crm_simple.simple_campaign_search'),
            'campaign_calendar': ref('crm_simple.simple_campaign_calendar'),
            'campaign_pivot': ref('crm_simple.simple_campaign_pivot'),
            'campaign_graph': ref('crm_simple.simple_campaign_graph'),
            'campaign_activity': ref('crm_simple.simple_campaign_activity'),
            'campaign_kanban': ref('crm_simple.simple_campaign_kanban'),
            'campaign_list': ref('crm_simple.simple_campaign_list'),
            # crm.lead — leads
            'lead_search': ref('crm.view_crm_case_leads_filter'),
            'lead_list': ref('crm.crm_case_tree_view_leads'),
            'lead_kanban': ref('crm.view_crm_lead_kanban'),
            'lead_calendar': ref('crm.crm_case_calendar_view_leads'),
            'lead_pivot': ref('crm.crm_lead_view_pivot'),
            'lead_graph': ref('crm.crm_lead_view_graph'),
            'lead_activity': ref('crm.crm_lead_view_activity'),
            # crm.lead — opportunities
            'opportunity_search': ref('crm.view_crm_case_opportunities_filter'),
            'opportunity_list': ref('crm.crm_case_tree_view_oppor'),
            'opportunity_kanban': ref('crm_modern.crm_lead_kanban_modern') or ref('crm.crm_case_kanban_view_leads'),
            'opportunity_calendar': ref('crm.crm_case_calendar_view_leads'),
            'opportunity_pivot': ref('crm.crm_lead_view_pivot'),
            'opportunity_graph': ref('crm.crm_lead_view_graph'),
            'opportunity_activity': ref('crm.crm_lead_view_activity'),
            # sales teams / members (standard views)
            'team_search': ref('sales_team.crm_team_view_search'),
            'team_list': ref('sales_team.crm_team_view_tree'),
            'team_kanban': ref('crm_modern.crm_team_kanban_modern') or ref('sales_team.crm_team_view_kanban'),
            'member_search': ref('sales_team.crm_team_member_view_search'),
            'member_list': ref('sales_team.crm_team_member_view_tree'),
            'member_kanban': ref('sales_team.crm_team_member_view_kanban'),
            'campaign_form': ref('crm_simple.simple_campaign_form'),
            # activities (mail.activity on leads / opportunities)
            'activity_search': ref('mail.mail_activity_view_search'),
            'activity_list': ref('mail.mail_activity_view_tree'),
            'activity_kanban': ref('mail.mail_activity_view_kanban_open_target'),
            'activity_calendar': ref('mail.mail_activity_view_calendar'),
            # configuration
            'stage_search': ref('crm.crm_lead_stage_search'),
            'stage_list': ref('crm.crm_stage_tree'),
            'atype_search': ref('mail.mail_activity_type_view_search'),
            'atype_list': ref('mail.mail_activity_type_view_tree'),
            'atype_kanban': ref('mail.mail_activity_type_view_kanban'),
            'plan_search': ref('mail.mail_activity_plan_view_search'),
            'plan_list': ref('mail.mail_activity_plan_view_tree'),
            'plan_kanban': ref('mail.mail_activity_plan_view_kanban'),
            'tag_list': ref('sales_team.sales_team_crm_tag_view_tree'),
        }

    # ------------------------------------------------------------------
    # Quick actions of the record page (compact composer / scheduler)
    # ------------------------------------------------------------------

    def crm_modern_post(self, body, kind='note'):
        """Post a message ('message': followers are notified) or an internal note."""
        self.ensure_one()
        body = (body or '').strip()
        if not body:
            raise UserError(self.env._("Write something first."))
        message = self.message_post(
            body=plaintext2html(body),
            message_type='comment',
            subtype_xmlid='mail.mt_comment' if kind == 'message' else 'mail.mt_note',
        )
        return message.id

    def crm_modern_schedule(self, activity_type_id, date_deadline=False, summary='', user_id=False, note=''):
        """Schedule one activity with Odoo's own activity_schedule (type defaults, chaining)."""
        self.ensure_one()
        values = {'activity_type_id': activity_type_id, 'automated': False}
        if user_id:
            values['user_id'] = user_id
        deadline = fields.Date.to_date(date_deadline) if date_deadline else None
        activity_type = self.env['mail.activity.type'].browse(activity_type_id).exists()
        if not deadline and activity_type and hasattr(activity_type, '_get_date_deadline'):
            deadline = activity_type._get_date_deadline()  # the type's "schedule after N days"
        activities = self.activity_schedule(
            date_deadline=deadline,
            summary=summary or '',
            note=plaintext2html(note) if note else '',
            **values,
        )
        return activities.ids

    # ------------------------------------------------------------------
    # CSV import (rows are parsed and mapped in the browser)
    # ------------------------------------------------------------------

    @staticmethod
    def _crm_modern_phone_key(phone):
        return re.sub(r'\D', '', phone or '')[-10:]

    @api.model
    def crm_modern_import(self, kind, rows, campaign_id, team_id=False, assign='round_robin'):
        """Create leads or opportunities for a campaign from mapped CSV rows.

        ``rows`` is a list of dicts whose keys are CRM field aliases
        (name, company, contact, email, phone, source, expected_revenue,
        probability, stage, date_deadline, priority, tags, salesperson, note).
        Duplicates (same phone or email inside the campaign) are skipped.
        With ``assign == 'round_robin'`` the salesperson is left empty so
        CRM Simple spreads the records over the campaign team.
        """
        if kind not in ('lead', 'opportunity'):
            raise UserError(self.env._("Choose Lead or Opportunity."))
        if kind == 'lead' and not self.env.user.has_group('crm.group_use_lead'):
            # Leads are switched off in CRM settings: everything goes to the pipeline.
            kind = 'opportunity'
        campaign = self.env['utm.campaign'].browse(campaign_id).exists()
        if not campaign:
            raise UserError(self.env._("The campaign no longer exists."))
        if team_id and campaign.simple_team_id.id != team_id:
            campaign.simple_team_id = team_id
        team = campaign.simple_team_id

        existing = self.with_context(active_test=False).search_read(
            [('campaign_id', '=', campaign.id)], ['phone', 'email_from'])
        seen_phone = {self._crm_modern_phone_key(r['phone']) for r in existing if r['phone']} - {''}
        seen_email = {r['email_from'].strip().lower() for r in existing if r['email_from']}

        Tag = self.env['crm.tag']
        tag_cache = {}

        def tag_ids(raw):
            ids = []
            for name in re.split(r'[;,|]', raw or ''):
                name = name.strip()
                if not name:
                    continue
                key = name.lower()
                if key not in tag_cache:
                    tag = Tag.search([('name', '=ilike', name)], limit=1) or Tag.create({'name': name})
                    tag_cache[key] = tag.id
                ids.append(tag_cache[key])
            return [(6, 0, ids)] if ids else False

        Users = self.env['res.users']
        user_cache = {}

        # Salespeople limited to their own documents may not create leads owned by
        # someone else (standard CRM record rule), so their imports stay with them.
        own_only = not self.env.user.has_group('sales_team.group_sale_salesman_all_leads')

        def user_for(raw):
            raw = (raw or '').strip()
            if assign == 'me' or own_only:
                return self.env.user.id
            if assign != 'column' or not raw:
                return False
            if raw not in user_cache:
                user = Users.search([
                    ('share', '=', False),
                    '|', '|', ('name', '=ilike', raw), ('login', '=ilike', raw), ('email', '=ilike', raw),
                ], limit=1)
                user_cache[raw] = user.id
            return user_cache[raw]

        stage_domain = ['|', ('team_ids', '=', False), ('team_ids', 'in', team.ids)] if team else []
        stages = self.env['crm.stage'].search(stage_domain)
        Source = self.env['utm.source']

        def number(value):
            value = re.sub(r'[^0-9.\-]', '', str(value or ''))
            try:
                return float(value) if value else 0.0
            except ValueError:
                return 0.0

        vals_list, skipped, invalid = [], 0, 0
        for row in rows:
            row = {k: (str(v).strip() if v is not None else '') for k, v in (row or {}).items()}
            title = row.get('name') or row.get('company') or row.get('contact')
            if not title:
                invalid += 1
                continue
            phone, email = row.get('phone', ''), row.get('email', '').lower()
            key = self._crm_modern_phone_key(phone)
            if (key and key in seen_phone) or (email and email in seen_email):
                skipped += 1
                continue
            if key:
                seen_phone.add(key)
            if email:
                seen_email.add(email)

            vals = {
                'type': kind,
                'name': title,
                'partner_name': row.get('company') or False,
                'contact_name': (row.get('contact') if kind == 'opportunity' else row.get('contact') or row.get('name')) or False,
                'email_from': row.get('email') or False,
                'phone': phone or False,
                'description': row.get('note') or False,
                'expected_revenue': number(row.get('expected_revenue')),
                'campaign_id': campaign.id,
                'team_id': team.id or False,
                'tag_ids': tag_ids(row.get('tags')),
            }
            user_id = user_for(row.get('salesperson'))
            if user_id:
                vals['user_id'] = user_id
            if row.get('source'):
                source = Source.search([('name', '=ilike', row['source'])], limit=1) or Source.create({'name': row['source']})
                vals['source_id'] = source.id
            if row.get('priority', '') in ('0', '1', '2', '3'):
                vals['priority'] = row['priority']
            if kind == 'opportunity':
                stage = row.get('stage') and stages.filtered(lambda s, n=row['stage'].lower(): s.name.lower() == n)[:1]
                if stage:
                    vals['stage_id'] = stage.id
                if row.get('probability'):
                    vals['probability'] = max(0.0, min(100.0, number(row['probability'])))
                if row.get('date_deadline'):
                    try:
                        vals['date_deadline'] = fields.Date.to_date(row['date_deadline'])
                    except ValueError:
                        pass
            vals_list.append(vals)

        records = self.create(vals_list) if vals_list else self.browse()
        return {'created': len(records), 'duplicates': skipped, 'invalid': invalid, 'ids': records.ids}
