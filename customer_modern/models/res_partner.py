"""Customer Modern: views and the owner dashboard of the Contacts app.

Read-only, on Odoo's own res.partner (no new table or field). Sales, purchase and
invoicing figures only appear when those apps are installed and the user may read
them; every figure respects the user's rights and record rules.
"""
import functools

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import PERIODS, growth, local_midnight, month_key, period_bounds
from odoo.tools import date_utils

LIST_FIELDS = ['name', 'display_name', 'is_company', 'parent_id', 'email', 'phone', 'country_id',
               'city', 'create_date', 'user_id']


class ResPartner(models.Model):
    _inherit = 'res.partner'

    # ------------------------------------------------------------------
    # Standard views shown in the pages (by xml id; a missing one falls
    # back to the model's default view)
    # ------------------------------------------------------------------
    @api.model
    def customer_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        views = {
            'list': ref('base.view_partner_tree'),
            'kanban': ref('base.res_partner_kanban_view'),
            'form': ref('base.view_partner_form'),
            'search': ref('base.view_res_partner_filter'),
            'activity': ref('mail.mail_activity_view_partner') or False,
        }
        ids = {}
        for prefix in ('contact', 'company', 'person', 'customer', 'vendor'):
            for view_type, view_id in views.items():
                ids[f'{prefix}_{view_type}'] = view_id
        return ids

    # ------------------------------------------------------------------
    # Owner dashboard
    # ------------------------------------------------------------------
    @api.model
    def customer_modern_dashboard(self, period='month'):
        as_dt = functools.partial(local_midnight, tz=self.env.tz)
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        Partner = self

        def count(domain):
            return Partner.search_count(domain)

        def created(a, b):
            return [('create_date', '>=', as_dt(a)), ('create_date', '<', as_dt(b))]

        has_ranks = 'customer_rank' in self._fields
        new, new_prev = count(created(start, end)), count(created(prev_start, prev_end))
        kpis = {
            'contacts': count([]),
            'companies': count([('is_company', '=', True)]),
            'people': count([('is_company', '=', False)]),
            'new': new, 'new_prev': new_prev, 'new_delta': growth(new, new_prev),
            'customers': count([('customer_rank', '>', 0)]) if has_ranks else None,
            'vendors': count([('supplier_rank', '>', 0)]) if has_ranks else None,
        }

        # ---------- new contacts per month: this year vs last year ----------
        year_start = date_utils.start_of(today, 'year')

        def monthly(a, b):
            return {month_key(m): c for m, c in Partner._read_group(created(a, b), ['create_date:month'], ['__count'])}

        this_year = monthly(year_start, year_start + relativedelta(years=1))
        last_year = monthly(year_start - relativedelta(years=1), year_start)
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
        spark_map = monthly(spark_start, end)
        spark = [spark_map.get(spark_start + relativedelta(months=i), 0) for i in range(12)]

        # ---------- where they are and how they are tagged ----------
        countries = [
            {'id': c.id, 'label': c.name, 'value': n}
            for c, n in Partner._read_group([('country_id', '!=', False)], ['country_id'], ['__count'],
                                            order='__count desc', limit=6)
        ]
        cities = [
            {'id': i, 'label': city, 'value': n}
            for i, (city, n) in enumerate(Partner._read_group(
                [('city', '!=', False)], ['city'], ['__count'], order='__count desc', limit=6), start=1)
        ]
        tags = []
        if self.env['res.partner.category'].browse().has_access('read'):
            tags = [
                {'id': t.id, 'label': t.display_name, 'value': n}
                for t, n in Partner._read_group([('category_id', '!=', False)], ['category_id'], ['__count'],
                                                order='__count desc', limit=7)
            ]

        # ---------- what to tidy up ----------
        attention = [
            {'key': 'no_email', 'count': count([('email', '=', False), ('type', '=', 'contact')]),
             'tone': 'info', 'icon': 'fa-envelope-o', 'label': self.env._('Contacts without an email')},
            {'key': 'no_phone', 'count': count([('phone', '=', False), ('type', '=', 'contact')]),
             'tone': 'info', 'icon': 'fa-phone', 'label': self.env._('Contacts without a phone')},
            {'key': 'activities', 'count': count([('activity_state', '=', 'overdue')]),
             'tone': 'warning', 'icon': 'fa-clock-o', 'label': self.env._('Contacts with overdue activities')},
        ]
        if 'is_blacklisted' in self._fields:
            attention.append({'key': 'blacklisted', 'count': count([('is_blacklisted', '=', True)]),
                              'tone': 'slate', 'icon': 'fa-ban', 'label': self.env._('Emails blacklisted')})

        sales = self._customer_modern_sales(start, end)
        purchases = self._customer_modern_purchases(start, end)
        finance = self._customer_modern_finance(today)
        if finance:
            attention.insert(0, {'key': 'overdue', 'count': finance['overdue_count'], 'tone': 'danger',
                                 'icon': 'fa-exclamation-circle', 'label': self.env._('Customers with overdue invoices'),
                                 'amount': finance['overdue']})

        recent = self.search_read([], LIST_FIELDS, order='create_date desc, id desc', limit=50)
        currency = self.env.company.currency_id
        return {
            'currency_id': currency.id,
            'lakh': currency.name == 'BDT',
            'period': period if period in PERIODS else 'month',
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'year': today.year,
            'company': self.env.company.name,
            'kpis': kpis,
            'spark': spark,
            'months': months,
            'countries': countries,
            'cities': cities,
            'tags': tags,
            'attention': attention,
            'sales': sales,
            'purchases': purchases,
            'finance': finance,
            'recent': recent,
        }

    @api.model
    def _customer_modern_sales(self, start, end):
        """Best customers of the period, only when Sales is installed and readable."""
        if 'sale.report' not in self.env or not self.env['sale.report'].browse().has_access('read'):
            return False
        as_dt = functools.partial(local_midnight, tz=self.env.tz)
        Report = self.env['sale.report']
        domain = [('state', '=', 'sale'), ('date', '>=', as_dt(start)), ('date', '<', as_dt(end))]
        top = [
            {'id': p.id, 'label': p.display_name, 'value': amount or 0.0, 'orders': orders or 0}
            for p, amount, orders in Report._read_group(
                domain + [('commercial_partner_id', '!=', False)], ['commercial_partner_id'],
                ['price_subtotal:sum', 'order_reference:count_distinct'],
                order='price_subtotal:sum desc', limit=6)
        ]
        [(buying,)] = Report._read_group(domain, aggregates=['commercial_partner_id:count_distinct'])
        return {'top': top, 'buying': buying or 0}

    @api.model
    def _customer_modern_purchases(self, start, end):
        """Main vendors of the period, only when Purchase is installed and readable."""
        if 'purchase.report' not in self.env or not self.env['purchase.report'].browse().has_access('read'):
            return False
        as_dt = functools.partial(local_midnight, tz=self.env.tz)
        Report = self.env['purchase.report']
        domain = [('state', '=', 'purchase'), ('date_order', '>=', as_dt(start)), ('date_order', '<', as_dt(end))]
        top = [
            {'id': p.id, 'label': p.display_name, 'value': amount or 0.0}
            for p, amount in Report._read_group(
                domain + [('commercial_partner_id', '!=', False)], ['commercial_partner_id'], ['untaxed_total:sum'],
                order='untaxed_total:sum desc', limit=6)
        ]
        return {'top': top}

    @api.model
    def _customer_modern_finance(self, today):
        """Who owes us money, only for users allowed to read invoices."""
        if 'account.move' not in self.env or not self.env['account.move'].browse().has_access('read'):
            return False
        Move = self.env['account.move']
        open_domain = [('move_type', 'in', ('out_invoice', 'out_refund')), ('state', '=', 'posted'),
                       ('payment_state', 'in', ('not_paid', 'partial'))]
        [(receivable,)] = Move._read_group(open_domain, aggregates=['amount_residual_signed:sum'])
        overdue_domain = open_domain + [('invoice_date_due', '<', today)]
        [(overdue,)] = Move._read_group(overdue_domain, aggregates=['amount_residual_signed:sum'])
        debtors = [
            {'id': p.id, 'label': p.display_name, 'value': amount or 0.0, 'count': n}
            for p, amount, n in Move._read_group(
                overdue_domain, ['commercial_partner_id'], ['amount_residual_signed:sum', '__count'],
                order='amount_residual_signed:sum desc', limit=6)
        ]
        debtors = [d for d in debtors if d['value'] > 0]
        [(overdue_customers,)] = Move._read_group(overdue_domain, aggregates=['commercial_partner_id:count_distinct'])
        return {
            'receivable': receivable or 0.0,
            'overdue': overdue or 0.0,
            'overdue_count': overdue_customers or 0,
            'debtors': debtors,
        }
