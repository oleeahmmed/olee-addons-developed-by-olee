"""Owner dashboard of Modern Purchase: one read-only call, everything the buyer needs.

Every figure is read with the user's own rights (record rules such as "own documents
only" apply), from Odoo's standard models: purchase.order / purchase.report for
purchasing, account.move / account.payment for vendor bills and cash out (only when
the user may read them). Amounts are untaxed and in the company currency
(purchase.report converts them).
"""
from datetime import datetime, time, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.tools import date_utils

PERIODS = ('month', 'quarter', 'year')
RFQ_STATES = ('draft', 'sent', 'to approve')
LIST_FIELDS = ['name', 'state', 'partner_id', 'user_id', 'date_order', 'date_planned',
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


def as_dt(day):
    return datetime.combine(day, time.min)


def delta(current, previous):
    """Growth in %, None when there is nothing to compare with."""
    if not previous:
        return None
    return round((current - previous) * 100.0 / abs(previous), 1)


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    @api.model
    def modern_purchase_owner_dashboard(self, period='month'):
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        Report = self.env['purchase.report']

        def report_sum(domain, field='untaxed_total'):
            [(amount,)] = Report._read_group(domain, aggregates=[f'{field}:sum'])
            return amount or 0.0

        def order_count(domain):
            return self.search_count(domain)

        def bought(a, b):
            return [('state', '=', 'purchase'), ('date_order', '>=', as_dt(a)), ('date_order', '<', as_dt(b))]

        spend, spend_prev = report_sum(bought(start, end)), report_sum(bought(prev_start, prev_end))
        orders, orders_prev = order_count(bought(start, end)), order_count(bought(prev_start, prev_end))

        # vendors bought from in the period, and those bought from for the very first time
        partners = {p.id for [p] in self._read_group(bought(start, end), ['partner_id'])}
        first_orders = dict(self._read_group(
            [('state', '=', 'purchase'), ('partner_id', 'in', list(partners))], ['partner_id'], ['date_order:min']))
        new_vendors = sum(1 for p, first in first_orders.items() if first and first >= as_dt(start))

        created = [('create_date', '>=', as_dt(start)), ('create_date', '<', as_dt(end))]
        requested = order_count(created + [('state', '!=', 'cancel')])
        confirmed = order_count(created + [('state', '=', 'purchase')])
        open_rfqs = order_count([('state', 'in', RFQ_STATES)])
        open_amount = report_sum([('state', 'in', RFQ_STATES)])
        to_bill_count = order_count([('invoice_status', '=', 'to invoice')])
        to_bill_amount = report_sum([('state', '=', 'purchase'), ('qty_to_be_billed', '>', 0)])

        kpis = {
            'spend': spend, 'spend_prev': spend_prev, 'spend_delta': delta(spend, spend_prev),
            'orders': orders, 'orders_prev': orders_prev, 'orders_delta': delta(orders, orders_prev),
            'avg_order': spend / orders if orders else 0.0,
            'avg_order_delta': delta(spend / orders if orders else 0.0, spend_prev / orders_prev if orders_prev else 0.0),
            'vendors': len(partners), 'new_vendors': new_vendors,
            'conversion': round(confirmed * 100 / requested) if requested else 0, 'requested': requested, 'confirmed': confirmed,
            'open_rfqs': open_rfqs, 'open_amount': open_amount,
            'to_bill_count': to_bill_count, 'to_bill_amount': to_bill_amount,
        }

        # ---------- 12 months: this year vs last year, plus the KPI sparklines ----------
        year_start = date_utils.start_of(today, 'year')
        last_year_start = year_start - relativedelta(years=1)

        def monthly(a, b):
            out = {}
            for month, amount, in Report._read_group(bought(a, b), ['date_order:month'], ['untaxed_total:sum']):
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
            for m, c in self._read_group(bought(spark_start, end), ['date_order:month'], ['__count'])
        }
        sparks = {'spend': [], 'orders': []}
        for i in range(12):
            month = spark_start + relativedelta(months=i)
            sparks['spend'].append(spark.get(month, 0.0))
            sparks['orders'].append(spark_orders.get(month, 0))

        # ---------- where the money goes ----------
        def ranked(groupby, limit, extra=None):
            return Report._read_group(
                bought(start, end) + [(groupby, '!=', False)], [groupby],
                ['untaxed_total:sum'] + (extra or []), order='untaxed_total:sum desc', limit=limit)

        categories = [{'id': c.id, 'label': c.display_name, 'value': a or 0.0} for c, a in ranked('category_id', 6)]
        rest = spend - sum(c['value'] for c in categories)
        if categories and rest > 0.5:
            categories.append({'id': 0, 'label': self.env._('Other'), 'value': rest})
        regions = [{'id': c.id, 'label': c.name, 'value': a or 0.0} for c, a in ranked('country_id', 8)]
        products = [{'id': p.id, 'label': p.display_name, 'value': a or 0.0, 'qty': q or 0.0}
                    for p, a, q in ranked('product_id', 6, ['qty_ordered:sum'])]
        vendor_orders = dict(self._read_group(bought(start, end), ['partner_id'], ['__count']))
        vendors = [{'id': p.id, 'label': p.display_name, 'value': a or 0.0, 'orders': vendor_orders.get(p, 0)}
                   for p, a in ranked('partner_id', 6)]

        # ---------- people: buyers ----------
        requested_by_user = dict(self._read_group(created + [('state', '!=', 'cancel')], ['user_id'], ['__count']))
        confirmed_by_user = dict(self._read_group(created + [('state', '=', 'purchase')], ['user_id'], ['__count']))
        orders_by_user = dict(self._read_group(bought(start, end), ['user_id'], ['__count']))
        buyers = []
        for user, amount in Report._read_group(
                bought(start, end) + [('user_id', '!=', False)], ['user_id'], ['untaxed_total:sum'],
                order='untaxed_total:sum desc', limit=8):
            q = requested_by_user.get(user, 0)
            buyers.append({
                'id': user.id, 'name': user.name, 'value': amount or 0.0, 'orders': orders_by_user.get(user, 0),
                'conversion': round(confirmed_by_user.get(user, 0) * 100 / q) if q else None,
            })

        # ---------- needs attention ----------
        waiting_count = order_count([('state', '=', 'sent'), ('date_order', '<', as_dt(today - timedelta(days=7)))])
        late_count = order_count([('state', '=', 'purchase'), ('is_late', '=', True)])
        attention = [
            {'key': 'waiting', 'count': waiting_count, 'tone': 'info', 'icon': 'fa-paper-plane-o',
             'label': self.env._('RFQs sent over 7 days ago, no answer')},
            {'key': 'to_bill', 'count': to_bill_count, 'tone': 'violet', 'icon': 'fa-file-text-o',
             'label': self.env._('Orders waiting for a vendor bill')},
            {'key': 'late', 'count': late_count, 'tone': 'warning', 'icon': 'fa-truck',
             'label': self.env._('Orders late for receipt')},
        ]

        # ---------- money out: bills, payables, cash (accounting rights only) ----------
        finance = self._modern_purchase_finance(start, end, prev_start, prev_end, today)
        if finance:
            attention.append({'key': 'overdue', 'count': finance['overdue_count'], 'tone': 'danger',
                              'icon': 'fa-exclamation-circle', 'label': self.env._('Overdue vendor bills'),
                              'amount': finance['overdue']})

        recent = self.search_read([('state', '=', 'purchase')], LIST_FIELDS, order='date_order desc, id desc', limit=7)
        waiting_rfqs = self.search_read(
            [('state', '=', 'sent'), ('date_order', '<', as_dt(today - timedelta(days=7)))],
            LIST_FIELDS, order='date_order asc', limit=5)
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
            'products': products,
            'vendors': vendors,
            'buyers': buyers,
            'attention': attention,
            'finance': finance,
            'recent': recent,
            'waiting_rfqs': waiting_rfqs,
            'company': self.env.company.name,
        }

    @api.model
    def _modern_purchase_finance(self, start, end, prev_start, prev_end, today):
        """Billed, payables and cash out, only for users allowed to read vendor bills."""
        if 'account.move' not in self.env or not self.env['account.move'].browse().has_access('read'):
            return False
        Move = self.env['account.move']
        base = [('move_type', 'in', ('in_invoice', 'in_refund')), ('state', '=', 'posted')]

        def billed(a, b):
            [(amount,)] = Move._read_group(
                base + [('invoice_date', '>=', a), ('invoice_date', '<', b)], aggregates=['amount_untaxed_signed:sum'])
            return -(amount or 0.0)

        open_domain = base + [('payment_state', 'in', ('not_paid', 'partial'))]
        [(payable, open_count)] = Move._read_group(open_domain, aggregates=['amount_residual_signed:sum', '__count'])
        [(overdue, overdue_count)] = Move._read_group(
            open_domain + [('invoice_date_due', '<', today)], aggregates=['amount_residual_signed:sum', '__count'])
        creditors = [
            {'id': p.id, 'label': p.display_name, 'value': -(amount or 0.0), 'count': count}
            for p, amount, count in Move._read_group(
                open_domain + [('invoice_date_due', '<', today)], ['partner_id'],
                ['amount_residual_signed:sum', '__count'], order='amount_residual_signed:sum asc', limit=5)
        ]
        # ageing of what's owed to vendors (days past the due date)
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
            ageing.append({'label': label, 'value': -(amount or 0.0)})

        paid = paid_prev = None
        if 'account.payment' in self.env and self.env['account.payment'].browse().has_access('read'):
            Payment = self.env['account.payment']
            pay = [('payment_type', '=', 'outbound'), ('partner_type', '=', 'supplier'), ('state', 'in', ('in_process', 'paid'))]

            def cash(a, b):
                [(amount,)] = Payment._read_group(pay + [('date', '>=', a), ('date', '<', b)], aggregates=['amount_company_currency_signed:sum'])
                return abs(amount or 0.0)

            paid, paid_prev = cash(start, end), cash(prev_start, prev_end)

        inv, inv_prev = billed(start, end), billed(prev_start, prev_end)
        return {
            'billed': inv, 'billed_prev': inv_prev, 'billed_delta': delta(inv, inv_prev),
            'payable': -(payable or 0.0), 'open_count': open_count,
            'overdue': -(overdue or 0.0), 'overdue_count': overdue_count,
            'paid': paid, 'paid_delta': delta(paid or 0.0, paid_prev or 0.0) if paid is not None else None,
            'creditors': creditors, 'ageing': ageing,
        }
