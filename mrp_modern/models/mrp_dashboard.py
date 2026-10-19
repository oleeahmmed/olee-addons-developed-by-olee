"""Owner dashboard of Manufacturing Modern: one read-only call.

Figures use the user's own rights (record rules apply) on Odoo's standard models:
mrp.production, mrp.bom, mrp.workorder (only when Work Orders are enabled).
"""
from datetime import datetime, time, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.tools import date_utils

PERIODS = ('month', 'quarter', 'year')
OPEN_STATES = ('draft', 'confirmed', 'progress', 'to_close')
LIVE_STATES = ('confirmed', 'progress', 'to_close')
LIST_FIELDS = ['name', 'state', 'product_id', 'product_qty', 'product_uom_id', 'date_start',
               'date_finished', 'date_deadline', 'user_id', 'bom_id']


def period_bounds(today, period):
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


class MrpProduction(models.Model):
    _inherit = 'mrp.production'

    @api.model
    def mrp_modern_owner_dashboard(self, period='month'):
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)

        def count(domain):
            return self.search_count(domain)

        def done(a, b):
            return [('state', '=', 'done'), ('date_finished', '>=', as_dt(a)), ('date_finished', '<', as_dt(b))]

        def qty_sum(domain):
            [(amount,)] = self._read_group(domain, aggregates=['product_qty:sum'])
            return amount or 0.0

        done_count, done_prev = count(done(start, end)), count(done(prev_start, prev_end))
        qty_done, qty_prev = qty_sum(done(start, end)), qty_sum(done(prev_start, prev_end))
        open_count = count([('state', 'in', OPEN_STATES)])
        in_progress = count([('state', '=', 'progress')])
        to_close = count([('state', '=', 'to_close')])
        draft = count([('state', '=', 'draft')])
        late = count([('state', 'in', LIVE_STATES), ('date_deadline', '<', as_dt(today))])
        waiting = count([('state', 'in', LIVE_STATES), ('components_availability_state', 'in', ('unavailable', 'late'))])
        created = [('create_date', '>=', as_dt(start)), ('create_date', '<', as_dt(end))]
        started = count(created + [('state', '!=', 'cancel')])
        finished = count(created + [('state', '=', 'done')])

        kpis = {
            'done': done_count, 'done_prev': done_prev, 'done_delta': delta(done_count, done_prev),
            'qty': qty_done, 'qty_prev': qty_prev, 'qty_delta': delta(qty_done, qty_prev),
            'open': open_count, 'in_progress': in_progress, 'to_close': to_close, 'draft': draft,
            'late': late, 'waiting': waiting,
            'conversion': round(finished * 100 / started) if started else 0,
            'started': started, 'finished': finished,
        }

        year_start = date_utils.start_of(today, 'year')
        last_year_start = year_start - relativedelta(years=1)

        def monthly(a, b):
            out = {}
            for month, c in self._read_group(done(a, b), ['date_finished:month'], ['__count']):
                out[month_key(month)] = c or 0
            return out

        this_year = monthly(year_start, year_start + relativedelta(years=1))
        last_year = monthly(last_year_start, year_start)
        months = []
        for i in range(12):
            month = year_start + relativedelta(months=i)
            months.append({
                'label': month.strftime('%b'),
                'value': this_year.get(month, 0),
                'previous': last_year.get(month - relativedelta(years=1), 0),
                'future': month > today,
            })
        spark_start = date_utils.start_of(today, 'month') - relativedelta(months=11)
        spark = monthly(spark_start, end)

        def sparkline(mapping):
            points = []
            for i in range(12):
                month = spark_start + relativedelta(months=i)
                points.append(mapping.get(month, 0) or 0)
            return points

        sparks = {'done': sparkline(spark), 'qty': sparkline(spark)}

        products = [
            {'id': p.id, 'label': p.display_name, 'value': qty or 0.0, 'qty': qty or 0.0, 'orders': c}
            for p, qty, c in self._read_group(
                done(start, end), ['product_id'], ['product_qty:sum', '__count'],
                order='product_qty:sum desc', limit=8)
        ]
        boms = self.env['mrp.bom'].search_count([]) if 'mrp.bom' in self.env else 0

        has_wo = 'mrp.workorder' in self.env and self.env.user.has_group('mrp.group_mrp_routings')
        workorders = 0
        if has_wo and self.env['mrp.workorder'].browse().has_access('read'):
            workorders = self.env['mrp.workorder'].search_count([('state', 'in', ('ready', 'progress', 'waiting'))])

        attention = [
            {'key': 'late', 'count': late, 'tone': 'danger', 'icon': 'fa-clock-o',
             'label': self.env._('Manufacturing orders past the deadline')},
            {'key': 'waiting', 'count': waiting, 'tone': 'warning', 'icon': 'fa-pause',
             'label': self.env._('Waiting for components')},
            {'key': 'to_close', 'count': to_close, 'tone': 'violet', 'icon': 'fa-flag-checkered',
             'label': self.env._('Ready to close')},
            {'key': 'draft', 'count': draft, 'tone': 'muted', 'icon': 'fa-file-o',
             'label': self.env._('Draft manufacturing orders')},
        ]
        if has_wo:
            attention.append({
                'key': 'workorders', 'count': workorders, 'tone': 'info', 'icon': 'fa-cogs',
                'label': self.env._('Work orders waiting or in progress'),
            })

        recent = self.search_read(
            [('state', '!=', 'cancel')], LIST_FIELDS, order='date_start desc, id desc', limit=8)

        currency = self.env.company.currency_id
        return {
            'currency_id': currency.id,
            'lakh': currency.name == 'BDT',
            'period': period if period in PERIODS else 'month',
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'kpis': kpis,
            'sparks': sparks,
            'months': months,
            'year': today.year,
            'products': products,
            'boms': boms,
            'has_wo': has_wo,
            'attention': attention,
            'recent': recent,
            'company': self.env.company.name,
        }
