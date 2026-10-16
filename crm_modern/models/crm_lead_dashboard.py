"""Owner dashboard of CRM Modern: the whole commercial picture in one read-only call.

Read with the user's own rights (record rules apply), from crm.lead, crm.stage, crm.team,
mail.activity and utm. Lost deals are archived by Odoo, so closed figures read archived
records too (active_test=False), open figures only active ones.
"""
from datetime import datetime, time, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.tools import date_utils

from .crm_lead_sale import has_sale

PERIODS = ('month', 'quarter', 'year')


def period_bounds(today, period):
    """(start, end, prev_start, prev_end): the period so far and the same span just before it."""
    period = period if period in PERIODS else 'month'
    start = date_utils.start_of(today, period)
    end = today + timedelta(days=1)
    step = {'month': relativedelta(months=1), 'quarter': relativedelta(months=3), 'year': relativedelta(years=1)}[period]
    prev_start = start - step
    prev_end = min(prev_start + (end - start), start)
    return start, end, prev_start, prev_end


def as_dt(day):
    return datetime.combine(day, time.min)


def delta(current, previous):
    if not previous:
        return None
    return round((current - previous) * 100.0 / abs(previous), 1)


def month_key(value):
    value = value.date() if hasattr(value, 'date') else value
    return value.replace(day=1)


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    @api.model
    def crm_modern_owner_dashboard(self, period='month', team_id=False):
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        Lead = self.with_context(active_test=False)
        team = [('team_id', '=', int(team_id))] if team_id else []
        opp = [('type', '=', 'opportunity')] + team
        open_domain = opp + [('active', '=', True), ('won_status', '=', 'pending')]

        def agg(domain, *aggregates):
            [row] = Lead._read_group(domain, aggregates=list(aggregates))
            return [v or 0 for v in row]

        def closed(status, a, b):
            return opp + [('won_status', '=', status), ('date_closed', '>=', as_dt(a)), ('date_closed', '<', as_dt(b))]

        open_count, pipeline, weighted = agg(open_domain, '__count', 'expected_revenue:sum', 'prorated_revenue:sum')
        won_count, won, cycle = agg(closed('won', start, end), '__count', 'expected_revenue:sum', 'day_close:avg')
        won_prev_count, won_prev = agg(closed('won', prev_start, prev_end), '__count', 'expected_revenue:sum')
        lost_count, lost = agg(closed('lost', start, end), '__count', 'expected_revenue:sum')
        lost_prev_count, = agg(closed('lost', prev_start, prev_end), '__count')
        decided, decided_prev = won_count + lost_count, won_prev_count + lost_prev_count
        win_rate = round(won_count * 100 / decided) if decided else None
        win_rate_prev = round(won_prev_count * 100 / decided_prev) if decided_prev else None

        created = [('create_date', '>=', as_dt(start)), ('create_date', '<', as_dt(end))] + team
        created_prev = [('create_date', '>=', as_dt(prev_start)), ('create_date', '<', as_dt(prev_end))] + team
        new_count = Lead.search_count(created)
        new_prev = Lead.search_count(created_prev)

        Activity = self.env['mail.activity']
        act = [('res_model', '=', 'crm.lead')]
        if team_id:
            act.append(('res_id', 'in', Lead._search(team)))
        overdue_acts = Activity.search_count(act + [('date_deadline', '<', today)])
        today_acts = Activity.search_count(act + [('date_deadline', '=', today)])

        kpis = {
            'pipeline': pipeline, 'weighted': weighted, 'open_count': open_count,
            'won': won, 'won_count': won_count, 'won_delta': delta(won, won_prev),
            'lost': lost, 'lost_count': lost_count,
            'win_rate': win_rate, 'win_rate_delta': (win_rate - win_rate_prev) if win_rate is not None and win_rate_prev is not None else None,
            'avg_deal': won / won_count if won_count else 0.0,
            'cycle': round(cycle) if won_count else None,
            'new': new_count, 'new_delta': delta(new_count, new_prev),
            'overdue_activities': overdue_acts, 'today_activities': today_acts,
        }

        # ---------- won revenue: this year vs last year, sparklines ----------
        year_start = date_utils.start_of(today, 'year')

        def won_by_month(a, b):
            return {month_key(m): v or 0.0 for m, v in Lead._read_group(
                closed('won', a, b), ['date_closed:month'], ['expected_revenue:sum'])}

        this_year = won_by_month(year_start, year_start + relativedelta(years=1))
        last_year = won_by_month(year_start - relativedelta(years=1), year_start)
        months = []
        for i in range(12):
            month = year_start + relativedelta(months=i)
            months.append({'label': month.strftime('%b'), 'value': this_year.get(month, 0.0),
                           'previous': last_year.get(month - relativedelta(years=1), 0.0), 'future': month > today})
        spark_start = date_utils.start_of(today, 'month') - relativedelta(months=11)
        spark_won = won_by_month(spark_start, end)
        spark_new = {month_key(m): c for m, c in Lead._read_group(
            [('create_date', '>=', as_dt(spark_start))] + team, ['create_date:month'], ['__count'])}
        sparks = {'won': [], 'new': []}
        for i in range(12):
            month = spark_start + relativedelta(months=i)
            sparks['won'].append(spark_won.get(month, 0.0))
            sparks['new'].append(spark_new.get(month, 0))

        # ---------- funnel: open deals per stage, then won in the period ----------
        per_stage = {s.id: (c, a or 0.0) for s, c, a in Lead._read_group(
            open_domain, ['stage_id'], ['__count', 'expected_revenue:sum'])}
        stage_domain = ['|', ('team_ids', '=', False), ('team_ids', 'in', [int(team_id)])] if team_id else []
        funnel = []
        for stage in self.env['crm.stage'].search(stage_domain):
            if stage.is_won:
                continue
            count, amount = per_stage.get(stage.id, (0, 0.0))
            funnel.append({'id': stage.id, 'label': stage.name, 'count': count, 'value': amount})
        funnel.append({'id': 'won', 'label': self.env._('Won'), 'count': won_count, 'value': won, 'won': True})

        # ---------- forecast: open deals by expected closing month ----------
        this_month = date_utils.start_of(today, 'month')
        by_close = {month_key(m): (c, a or 0.0, p or 0.0) for m, c, a, p in Lead._read_group(
            open_domain + [('date_deadline', '!=', False)], ['date_deadline:month'],
            ['__count', 'expected_revenue:sum', 'prorated_revenue:sum'])}
        forecast = []
        overdue_close = [0, 0.0, 0.0]
        for m, (c, a, p) in by_close.items():
            if m < this_month:
                overdue_close = [overdue_close[0] + c, overdue_close[1] + a, overdue_close[2] + p]
        for i in range(3):
            month = this_month + relativedelta(months=i)
            c, a, p = by_close.get(month, (0, 0.0, 0.0))
            forecast.append({'label': month.strftime('%b %Y'), 'count': c, 'value': a, 'weighted': p})
        no_date_count, no_date = agg(open_domain + [('date_deadline', '=', False)], '__count', 'expected_revenue:sum')

        # ---------- where deals come from, why they are lost ----------
        won_in = closed('won', start, end)
        source_won = {s: (c, a or 0.0) for s, c, a in Lead._read_group(
            won_in + [('source_id', '!=', False)], ['source_id'], ['__count', 'expected_revenue:sum'])}
        sources = []
        for source, count in Lead._read_group(created + [('source_id', '!=', False)], ['source_id'], ['__count'],
                                              order='__count desc', limit=6):
            wc, wa = source_won.get(source, (0, 0.0))
            sources.append({'id': source.id, 'label': source.name, 'count': count, 'won_count': wc, 'value': wa,
                            'rate': round(wc * 100 / count) if count else 0})
        no_source = Lead.search_count(created + [('source_id', '=', False)])
        lost_reasons = [{'id': r.id, 'label': r.name, 'count': c, 'value': a or 0.0} for r, c, a in Lead._read_group(
            closed('lost', start, end) + [('lost_reason_id', '!=', False)], ['lost_reason_id'],
            ['__count', 'expected_revenue:sum'], order='__count desc', limit=5)]

        # ---------- people ----------
        won_by_user = {u: (c, a or 0.0) for u, c, a in Lead._read_group(
            won_in + [('user_id', '!=', False)], ['user_id'], ['__count', 'expected_revenue:sum'])}
        lost_by_user = dict(Lead._read_group(closed('lost', start, end) + [('user_id', '!=', False)], ['user_id'], ['__count']))
        open_by_user = {u: (c, a or 0.0) for u, c, a in Lead._read_group(
            open_domain + [('user_id', '!=', False)], ['user_id'], ['__count', 'expected_revenue:sum'])}
        late_by_user = dict(Activity._read_group(act + [('date_deadline', '<', today)], ['user_id'], ['__count']))
        users = set(won_by_user) | set(open_by_user)
        salespeople = []
        for user in users:
            wc, wa = won_by_user.get(user, (0, 0.0))
            oc, oa = open_by_user.get(user, (0, 0.0))
            lc = lost_by_user.get(user, 0)
            salespeople.append({'id': user.id, 'name': user.name, 'won': wa, 'won_count': wc,
                                'open_count': oc, 'pipeline': oa,
                                'win_rate': round(wc * 100 / (wc + lc)) if wc + lc else None,
                                'overdue': late_by_user.get(user, 0)})
        salespeople.sort(key=lambda r: (r['won'], r['pipeline']), reverse=True)

        team_won = {t: a or 0.0 for t, a in Lead._read_group(
            closed('won', start, end) + [('team_id', '!=', False)], ['team_id'], ['expected_revenue:sum'])}
        team_open = {t: (c, a or 0.0) for t, c, a in Lead._read_group(
            open_domain + [('team_id', '!=', False)], ['team_id'], ['__count', 'expected_revenue:sum'])}
        teams = []
        for t in self.env['crm.team'].search([('id', '=', int(team_id))] if team_id else [], limit=8):
            oc, oa = team_open.get(t, (0, 0.0))
            teams.append({'id': t.id, 'name': t.name, 'leader': t.user_id.name or '', 'leader_id': t.user_id.id,
                          'members': len(t.member_ids), 'won': team_won.get(t, 0.0), 'open_count': oc, 'pipeline': oa})
        teams.sort(key=lambda r: (r['won'], r['pipeline']), reverse=True)

        # ---------- needs attention ----------
        stale_before = fields.Datetime.now() - timedelta(days=30)
        stale_domain = open_domain + [('date_last_stage_update', '<', stale_before)]
        stale = Lead.search_read(stale_domain, ['name', 'partner_id', 'user_id', 'expected_revenue', 'stage_id',
                                                'date_last_stage_update', 'probability'],
                                 order='expected_revenue desc', limit=5)
        stale_count = Lead.search_count(stale_domain)
        no_activity = Lead.search_count(open_domain + [('activity_ids', '=', False)])
        unassigned = Lead.search_count([('active', '=', True), ('won_status', '=', 'pending'), ('user_id', '=', False)] + team)
        attention = [
            {'key': 'overdue_activities', 'count': overdue_acts, 'tone': 'danger', 'icon': 'fa-clock-o',
             'label': self.env._('Overdue activities')},
            {'key': 'closing_late', 'count': overdue_close[0], 'amount': overdue_close[1], 'tone': 'warning',
             'icon': 'fa-calendar-times-o', 'label': self.env._('Deals past their expected closing')},
            {'key': 'stale', 'count': stale_count, 'tone': 'warning', 'icon': 'fa-hourglass-half',
             'label': self.env._('No stage change for 30+ days')},
            {'key': 'no_activity', 'count': no_activity, 'tone': 'info', 'icon': 'fa-calendar-plus-o',
             'label': self.env._('Open deals with nothing planned')},
            {'key': 'unassigned', 'count': unassigned, 'tone': 'muted', 'icon': 'fa-user-times',
             'label': self.env._('Leads & deals without a salesperson')},
        ]
        late_activities = Activity.search_read(
            act + [('date_deadline', '<=', today)],
            ['summary', 'activity_type_id', 'res_id', 'res_name', 'user_id', 'date_deadline'],
            order='date_deadline asc', limit=6)

        campaigns = self._crm_modern_campaign_stats(team_id, limit=6)

        currency = self.env.company.currency_id
        return {
            'campaigns': campaigns,
            'currency_id': currency.id,
            'lakh': currency.name == 'BDT',
            'period': period if period in PERIODS else 'month',
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'year': today.year,
            'kpis': kpis,
            'sparks': sparks,
            'months': months,
            'funnel': funnel,
            'forecast': forecast,
            'no_date': {'count': no_date_count, 'value': no_date},
            'sources': sources,
            'no_source': no_source,
            'lost_reasons': lost_reasons,
            'salespeople': salespeople[:8],
            'teams': teams,
            'attention': attention,
            'stale': stale,
            'late_activities': late_activities,
            'team_options': self.env['crm.team'].search_read([], ['name'], order='sequence, name'),
            'has_sale': has_sale(self.env),
            'company': self.env.company.name,
        }
