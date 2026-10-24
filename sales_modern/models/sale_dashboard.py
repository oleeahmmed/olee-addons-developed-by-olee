"""Owner dashboard of Sales Modern: one read-only call, everything the owner needs.

Every figure is read with the user's own rights (record rules such as "own documents
only" apply), from Odoo's standard models: sale.order / sale.report for sales,
account.move / account.payment for invoices and cash (only when the user may read them).
Amounts are untaxed and in the company currency (sale.report converts them).
"""
import functools
from datetime import datetime, time, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import local_midnight
from odoo.tools import date_utils

PERIODS = ('month', 'quarter', 'year')
QUOTATION_STATES = ('draft', 'sent')
LIST_FIELDS = ['name', 'state', 'partner_id', 'user_id', 'team_id', 'date_order', 'validity_date',
               'amount_untaxed', 'amount_total', 'currency_id', 'invoice_status']


def period_bounds(today, period):
    """(start, end, prev_start, prev_end): the period so far and the same span just before it.

    "This month" on the 17th is compared with the 1st-17th of last month, so the comparison
    is fair at any point of the period.
    """
    period = period if period in PERIODS else 'month'
    start = date_utils.start_of(today, period)
    end = today + timedelta(days=1)
    step = {'month': relativedelta(months=1), 'quarter': relativedelta(months=3), 'year': relativedelta(years=1)}[period]
    prev_start = start - step
    prev_end = min(prev_start + (end - start), start)
    return start, end, prev_start, prev_end


def as_dt_tz(day, tz=None):
    """Local midnight of `day` (user's timezone) as the naive UTC datetime Odoo stores."""
    return local_midnight(day, tz)


as_dt = as_dt_tz  # UTC fallback; dashboard methods bind the user's timezone (see below)


def delta(current, previous):
    """Growth in %, None when there is nothing to compare with."""
    if not previous:
        return None
    return round((current - previous) * 100.0 / abs(previous), 1)


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    @api.model
    def sales_modern_owner_dashboard(self, period='month', team_id=False):
        as_dt = functools.partial(as_dt_tz, tz=self.env.tz)
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        Report = self.env['sale.report']
        team = [('team_id', '=', int(team_id))] if team_id else []

        def report_sum(domain, field='price_subtotal'):
            [(amount,)] = Report._read_group(domain + team, aggregates=[f'{field}:sum'])
            return amount or 0.0

        def order_count(domain):
            return self.search_count(domain + team)

        def sold(a, b):
            return [('state', '=', 'sale'), ('date', '>=', as_dt(a)), ('date', '<', as_dt(b))]

        def sold_orders(a, b):
            return [('state', '=', 'sale'), ('date_order', '>=', as_dt(a)), ('date_order', '<', as_dt(b))]

        revenue, revenue_prev = report_sum(sold(start, end)), report_sum(sold(prev_start, prev_end))
        orders, orders_prev = order_count(sold_orders(start, end)), order_count(sold_orders(prev_start, prev_end))

        # customers who ordered in the period, and those ordering for the very first time
        partners = {p.id for [p] in self._read_group(sold_orders(start, end) + team, ['partner_id'])}
        first_orders = dict(self._read_group(
            [('state', '=', 'sale'), ('partner_id', 'in', list(partners))], ['partner_id'], ['date_order:min']))
        new_customers = sum(1 for p, first in first_orders.items() if first and first >= as_dt(start))

        created = [('create_date', '>=', as_dt(start)), ('create_date', '<', as_dt(end))]
        quoted = order_count(created + [('state', '!=', 'cancel')])
        won = order_count(created + [('state', '=', 'sale')])
        open_quotes = order_count([('state', 'in', QUOTATION_STATES)])
        open_amount = report_sum([('state', 'in', QUOTATION_STATES)])
        to_invoice_count = order_count([('invoice_status', '=', 'to invoice')])
        to_invoice_amount = report_sum([('state', '=', 'sale')], 'untaxed_amount_to_invoice')

        kpis = {
            'revenue': revenue, 'revenue_prev': revenue_prev, 'revenue_delta': delta(revenue, revenue_prev),
            'orders': orders, 'orders_prev': orders_prev, 'orders_delta': delta(orders, orders_prev),
            'avg_order': revenue / orders if orders else 0.0,
            'avg_order_delta': delta(revenue / orders if orders else 0.0, revenue_prev / orders_prev if orders_prev else 0.0),
            'customers': len(partners), 'new_customers': new_customers,
            'conversion': round(won * 100 / quoted) if quoted else 0, 'quoted': quoted, 'won': won,
            'open_quotes': open_quotes, 'open_amount': open_amount,
            'to_invoice_count': to_invoice_count, 'to_invoice_amount': to_invoice_amount,
        }

        # ---------- 12 months: this year vs last year, plus the KPI sparklines ----------
        year_start = date_utils.start_of(today, 'year')
        last_year_start = year_start - relativedelta(years=1)

        def monthly(a, b):
            out = {}
            for month, amount, in Report._read_group(sold(a, b) + team, ['date:month'], ['price_subtotal:sum']):
                out[(month.date() if hasattr(month, 'date') else month).replace(day=1)] = amount or 0.0
            return out

        this_year = monthly(year_start, year_start + relativedelta(years=1))
        last_year = monthly(last_year_start, year_start)
        months = []
        for i in range(12):
            month = year_start + relativedelta(months=i)
            months.append({
                'label': month.strftime('%b'),
                'value': this_year.get(month, 0.0),
                'previous': last_year.get(month - relativedelta(years=1), 0.0),
                'future': month > today,
            })
        spark_start = date_utils.start_of(today, 'month') - relativedelta(months=11)
        spark = monthly(spark_start, end)
        spark_orders = {
            (m.date() if hasattr(m, 'date') else m).replace(day=1): c
            for m, c in self._read_group(sold_orders(spark_start, end) + team, ['date_order:month'], ['__count'])
        }
        sparks = {'revenue': [], 'orders': []}
        for i in range(12):
            month = spark_start + relativedelta(months=i)
            sparks['revenue'].append(spark.get(month, 0.0))
            sparks['orders'].append(spark_orders.get(month, 0))

        # ---------- where the money comes from ----------
        def ranked(groupby, limit, extra=None):
            rows = Report._read_group(
                sold(start, end) + team + [(groupby, '!=', False)], [groupby],
                ['price_subtotal:sum'] + (extra or []), order='price_subtotal:sum desc', limit=limit)
            return rows

        categories = [{'id': c.id, 'label': c.display_name, 'value': a or 0.0} for c, a in ranked('categ_id', 6)]
        rest = revenue - sum(c['value'] for c in categories)
        if categories and rest > 0.5:
            categories.append({'id': 0, 'label': self.env._('Other'), 'value': rest})
        regions = [{'id': s.id, 'label': s.name, 'value': a or 0.0} for s, a in ranked('state_id', 8)]
        region_field = 'state_id'
        if not regions:
            region_field = 'country_id'
            regions = [{'id': c.id, 'label': c.name, 'value': a or 0.0} for c, a in ranked('country_id', 8)]
        products = [{'id': p.id, 'label': p.display_name, 'value': a or 0.0, 'qty': q or 0.0}
                    for p, a, q in ranked('product_id', 6, ['product_uom_qty:sum'])]
        customer_orders = dict(self._read_group(sold_orders(start, end) + team, ['partner_id'], ['__count']))
        customers = [{'id': p.id, 'label': p.display_name, 'value': a or 0.0, 'orders': customer_orders.get(p, 0)}
                     for p, a in ranked('partner_id', 6)]

        # ---------- people: salespeople and teams ----------
        quotes_by_user = dict(self._read_group(created + team + [('state', '!=', 'cancel')], ['user_id'], ['__count']))
        won_by_user = dict(self._read_group(created + team + [('state', '=', 'sale')], ['user_id'], ['__count']))
        orders_by_user = dict(self._read_group(sold_orders(start, end) + team, ['user_id'], ['__count']))
        salespeople = []
        for user, amount in Report._read_group(
                sold(start, end) + team + [('user_id', '!=', False)], ['user_id'], ['price_subtotal:sum'],
                order='price_subtotal:sum desc', limit=8):
            q = quotes_by_user.get(user, 0)
            salespeople.append({
                'id': user.id, 'name': user.name, 'value': amount or 0.0, 'orders': orders_by_user.get(user, 0),
                'conversion': round(won_by_user.get(user, 0) * 100 / q) if q else None,
            })

        team_rows = []
        team_domain = [('id', '=', int(team_id))] if team_id else []
        team_revenue = dict(Report._read_group(sold(start, end) + [('team_id', '!=', False)], ['team_id'], ['price_subtotal:sum']))
        for t in self.env['crm.team'].search(team_domain, limit=8):
            row = {
                'id': t.id, 'name': t.name, 'leader': t.user_id.name or '', 'leader_id': t.user_id.id,
                'members': len(t.member_ids), 'value': team_revenue.get(t, 0.0) or 0.0,
            }
            if 'invoiced_target' in t._fields:
                # Odoo's own monthly invoicing target of the team (Sales > Teams)
                row.update({'target': t.invoiced_target or 0.0, 'invoiced': t.invoiced or 0.0})
            team_rows.append(row)
        team_rows.sort(key=lambda r: r['value'], reverse=True)

        # ---------- needs attention ----------
        week = today + timedelta(days=7)
        expiring = self.search_read(
            [('state', 'in', QUOTATION_STATES), ('validity_date', '>=', today), ('validity_date', '<=', week)] + team,
            LIST_FIELDS, order='validity_date asc', limit=5)
        expiring_count = order_count([('state', 'in', QUOTATION_STATES), ('validity_date', '>=', today), ('validity_date', '<=', week)])
        waiting_count = order_count([('state', '=', 'sent'), ('date_order', '<', as_dt(today - timedelta(days=7)))])
        expired_count = order_count([('state', 'in', QUOTATION_STATES), ('validity_date', '<', today)])
        attention = [
            {'key': 'expiring', 'count': expiring_count, 'tone': 'warning', 'icon': 'fa-hourglass-half',
             'label': self.env._('Quotations expiring this week')},
            {'key': 'waiting', 'count': waiting_count, 'tone': 'info', 'icon': 'fa-paper-plane-o',
             'label': self.env._('Sent over 7 days ago, no answer')},
            {'key': 'expired', 'count': expired_count, 'tone': 'muted', 'icon': 'fa-calendar-times-o',
             'label': self.env._('Expired quotations still open')},
            {'key': 'to_invoice', 'count': to_invoice_count, 'tone': 'violet', 'icon': 'fa-file-text-o',
             'label': self.env._('Orders ready to invoice')},
        ]
        if 'delivery_status' in self._fields and self._fields['delivery_status'].store:
            late = order_count([('state', '=', 'sale'), ('delivery_status', 'in', ('pending', 'partial', 'started')),
                                ('commitment_date', '<', as_dt(today))])
            pending = order_count([('state', '=', 'sale'), ('delivery_status', 'in', ('pending', 'partial', 'started'))])
            attention.append({'key': 'delivery', 'count': pending, 'late': late, 'tone': 'info', 'icon': 'fa-truck',
                              'label': self.env._('Orders waiting for delivery')})

        # ---------- money in: invoices, receivables, cash (accounting rights only) ----------
        finance = self._sales_modern_finance(start, end, prev_start, prev_end, today, team_id)
        if finance:
            attention.append({'key': 'overdue', 'count': finance['overdue_count'], 'tone': 'danger',
                              'icon': 'fa-exclamation-circle', 'label': self.env._('Overdue customer invoices'),
                              'amount': finance['overdue']})

        recent = self.search_read([('state', '=', 'sale')] + team, LIST_FIELDS, order='date_order desc, id desc', limit=50)
        # order status tiles (shadcn "Track order status"): standard sale.order states
        status = {
            'draft': order_count([('state', '=', 'draft')]),
            'sent': order_count([('state', '=', 'sent')]),
            'sale': orders,
            'to_invoice': to_invoice_count,
            'cancel': order_count([('state', '=', 'cancel'), ('write_date', '>=', as_dt(start))]),
        }
        teams = self.env['crm.team'].search_read([], ['name'], order='sequence, name')
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
            'categories': categories,
            'regions': regions,
            'region_field': region_field,
            'products': products,
            'customers': customers,
            'salespeople': salespeople,
            'teams': team_rows,
            'team_options': teams,
            'attention': attention,
            'expiring': expiring,
            'finance': finance,
            'recent': recent,
            'status': status,
            'company': self.env.company.name,
        }

    @api.model
    def _sales_modern_finance(self, start, end, prev_start, prev_end, today, team_id=False):
        """Invoiced, receivables and cash in, only for users allowed to read invoices."""
        if 'account.move' not in self.env or not self.env['account.move'].browse().has_access('read'):
            return False
        Move = self.env['account.move']
        base = [('move_type', 'in', ('out_invoice', 'out_refund')), ('state', '=', 'posted')]
        if team_id and 'team_id' in Move._fields:
            base.append(('team_id', '=', int(team_id)))

        def invoiced(a, b):
            [(amount,)] = Move._read_group(
                base + [('invoice_date', '>=', a), ('invoice_date', '<', b)], aggregates=['amount_untaxed_signed:sum'])
            return amount or 0.0

        open_domain = base + [('payment_state', 'in', ('not_paid', 'partial'))]
        [(receivable, open_count)] = Move._read_group(open_domain, aggregates=['amount_residual_signed:sum', '__count'])
        [(overdue, overdue_count)] = Move._read_group(
            open_domain + [('invoice_date_due', '<', today)], aggregates=['amount_residual_signed:sum', '__count'])
        debtors = [
            {'id': p.id, 'label': p.display_name, 'value': amount or 0.0, 'count': count}
            for p, amount, count in Move._read_group(
                open_domain + [('invoice_date_due', '<', today)], ['partner_id'],
                ['amount_residual_signed:sum', '__count'], order='amount_residual_signed:sum desc', limit=10)
        ]
        debtors = [r for r in debtors if r['value'] > 0][:5]  # credit notes can net a balance out
        # ageing of what customers owe (days past the due date)
        ageing = []
        for label, low, high in (('Not due', None, 0), ('1–30 d', 1, 30), ('31–60 d', 31, 60), ('61–90 d', 61, 90), ('90+ d', 91, None)):
            domain = list(open_domain)
            if low is None:
                domain.append(('invoice_date_due', '>=', today))
            else:
                domain.append(('invoice_date_due', '<=', today - timedelta(days=low)))
                if high is not None:
                    domain.append(('invoice_date_due', '>', today - timedelta(days=high + 1)))
            [(amount,)] = Move._read_group(domain, aggregates=['amount_residual_signed:sum'])
            ageing.append({'label': label, 'value': amount or 0.0})

        collected = collected_prev = None
        if 'account.payment' in self.env and self.env['account.payment'].browse().has_access('read'):
            Payment = self.env['account.payment']
            pay = [('payment_type', '=', 'inbound'), ('partner_type', '=', 'customer'), ('state', 'in', ('in_process', 'paid'))]

            def cash(a, b):
                [(amount,)] = Payment._read_group(pay + [('date', '>=', a), ('date', '<', b)], aggregates=['amount_company_currency_signed:sum'])
                return amount or 0.0

            collected, collected_prev = cash(start, end), cash(prev_start, prev_end)

        inv, inv_prev = invoiced(start, end), invoiced(prev_start, prev_end)
        return {
            'invoiced': inv, 'invoiced_prev': inv_prev, 'invoiced_delta': delta(inv, inv_prev),
            'receivable': receivable or 0.0, 'open_count': open_count,
            'overdue': overdue or 0.0, 'overdue_count': overdue_count,
            'collected': collected, 'collected_delta': delta(collected or 0.0, collected_prev or 0.0) if collected is not None else None,
            'debtors': debtors, 'ageing': ageing,
        }
