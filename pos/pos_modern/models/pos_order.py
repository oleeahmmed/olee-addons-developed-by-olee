"""Modern POS: view ids of the pages and the shop owner's dashboard.

Read-only, on Odoo's own pos.config / pos.session / pos.order / pos.payment (no new table
or field). Every figure is read with the user's own rights, record rules and allowed
companies. Amounts are in the company currency, as in Odoo's own POS reporting.
"""
import functools
import logging
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import PERIODS, growth, local_midnight, month_key, period_bounds
from odoo.tools import date_utils

_logger = logging.getLogger(__name__)

SOLD = ('paid', 'done', 'invoiced')
STATE_TONES = {'draft': 'amber', 'paid': 'blue', 'done': 'teal', 'invoiced': 'violet', 'cancel': 'slate'}
SESSION_TONES = {'opening_control': 'sky', 'opened': 'teal', 'closing_control': 'amber', 'closed': 'slate'}


def _safe(default):
    """A dashboard block that cannot be computed (an Odoo update moved a field…) is left
    out instead of breaking the whole dashboard."""
    def deco(func):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                with self.env.cr.savepoint():
                    return func(self, *args, **kwargs)
            except Exception:  # noqa: BLE001
                _logger.warning("pos_modern: dashboard block %s skipped", func.__name__, exc_info=True)
                return default
        return wrapper
    return deco


def _json(value):
    if isinstance(value, datetime):
        return fields.Datetime.to_string(value)
    if hasattr(value, 'isoformat'):
        return fields.Date.to_string(value)
    return value


def _json_domain(domain):
    return [[t[0], t[1], _json(t[2])] if isinstance(t, (list, tuple)) and len(t) == 3 else t for t in domain]


class PosOrder(models.Model):
    _inherit = 'pos.order'

    # ------------------------------------------------------------------
    # Views of the pages (by xml id; a missing one falls back to the model's
    # default view, so an Odoo update cannot break a page)
    # ------------------------------------------------------------------
    @api.model
    def pos_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        order = {
            'list': ref('point_of_sale.view_pos_order_tree'),
            'kanban': ref('pos_modern.order_kanban'),
            'form': ref('point_of_sale.view_pos_pos_form'),
            'search': ref('point_of_sale.view_pos_order_filter'),
            'pivot': ref('point_of_sale.view_pos_order_pivot'),
        }
        ids = {}
        for prefix in ('order', 'refund', 'ongoing'):
            for view_type, view_id in order.items():
                ids[f'{prefix}_{view_type}'] = view_id
        ids.update({
            'shop_kanban': ref('pos_modern.shop_kanban'),
            'shop_list': ref('point_of_sale.view_pos_config_tree'),
            'shop_form': ref('point_of_sale.pos_config_view_form'),
            'shop_search': ref('point_of_sale.view_pos_config_search'),
            'session_list': ref('point_of_sale.view_pos_session_tree'),
            'session_kanban': ref('point_of_sale.view_pos_session_kanban'),
            'session_form': ref('point_of_sale.view_pos_session_form'),
            'session_search': ref('point_of_sale.view_pos_session_search'),
            'payment_list': ref('point_of_sale.view_pos_payment_tree'),
            'payment_form': ref('point_of_sale.view_pos_payment_form'),
            'payment_search': ref('point_of_sale.view_pos_payment_search'),
            'product_kanban': ref('product.product_template_kanban_view'),
            'product_list': ref('point_of_sale.product_template_tree_view_point_of_sale'),
            'product_form': ref('product.product_template_only_form_view'),
            'product_search': ref('product.product_template_search_view'),
            'customer_kanban': ref('base.res_partner_kanban_view'),
            'customer_list': ref('base.view_partner_tree'),
            'customer_form': ref('base.view_partner_form'),
            'customer_search': ref('base.view_res_partner_filter'),
            'category_list': ref('pos_modern.category_list'),
            'category_kanban': ref('point_of_sale.view_pos_category_kanban'),
            'category_form': ref('point_of_sale.product_pos_category_form_view'),
        })
        return ids

    # ------------------------------------------------------------------
    # Shop owner's dashboard
    # ------------------------------------------------------------------
    @api.model
    def pos_modern_dashboard(self, period='month', config_id=False):
        period = period if period in PERIODS else 'month'
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        as_dt = functools.partial(local_midnight, tz=self.env.tz)
        company = self.env.company
        scope = [('company_id', 'in', self.env.companies.ids)]
        if config_id:
            scope.append(('config_id', '=', config_id))
        sold = scope + [('state', 'in', SOLD)]

        def between(a, b):
            return [('date_order', '>=', as_dt(a)), ('date_order', '<', as_dt(b))]

        def figures(a, b):
            groups = self._read_group(sold + between(a, b), [], ['amount_total:sum', '__count'])
            total, count = groups[0] if groups else (0.0, 0)
            customers = len(self._read_group(sold + between(a, b) + [('partner_id', '!=', False)], ['partner_id']))
            refunds = self._read_group(sold + between(a, b) + [('amount_total', '<', 0)], [], ['amount_total:sum'])
            return {
                'revenue': total or 0.0,
                'orders': count,
                'basket': (total / count) if count else 0.0,
                'customers': customers,
                'refunds': -(refunds[0][0] or 0.0) if refunds else 0.0,
            }

        cur = self._pos_modern_try(lambda: figures(start, end), {})
        prev = self._pos_modern_try(lambda: figures(prev_start, prev_end), {})
        kpis = {}
        for key in ('revenue', 'orders', 'basket', 'customers', 'refunds'):
            kpis[key] = cur.get(key, 0)
            kpis[f'{key}_prev'] = prev.get(key, 0)
            kpis[f'{key}_delta'] = growth(cur.get(key, 0), prev.get(key, 0))
        sessions = self.env['pos.session']
        session_scope = [('config_id.company_id', 'in', self.env.companies.ids)]
        if config_id:
            session_scope.append(('config_id', '=', config_id))
        kpis['open_sessions'] = self._pos_modern_try(
            lambda: sessions.search_count(session_scope + [('state', '!=', 'closed')]), 0)
        kpis['shops'] = self._pos_modern_try(
            lambda: self.env['pos.config'].search_count([('company_id', 'in', self.env.companies.ids)]), 0)

        months, spark = self._pos_modern_by_month(sold, today, end, as_dt)
        return {
            'period': period,
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'year': today.year,
            'company': company.name,
            'currency_id': company.currency_id.id,
            'currency_name': company.currency_id.name,
            'config_id': config_id or False,
            'shop_list': self._pos_modern_shop_list(),
            'kpis': kpis,
            'spark': spark,
            'months': months,
            'attention': self._pos_modern_attention(scope, session_scope, today, as_dt),
            'top_products': self._pos_modern_top_products(sold + between(start, end)),
            'by_shop': self._pos_modern_by_shop(sold + between(start, end)),
            'by_method': self._pos_modern_by_method(scope, start, end, as_dt),
            'shops': self._pos_modern_shops(config_id),
            'recent': self._pos_modern_recent(scope),
        }

    # ------------------------------------------------------------------
    # Blocks
    # ------------------------------------------------------------------
    @api.model
    def _pos_modern_try(self, func, default):
        try:
            with self.env.cr.savepoint():
                return func()
        except Exception:  # noqa: BLE001
            _logger.warning("pos_modern: dashboard figure skipped", exc_info=True)
            return default

    @api.model
    @_safe([])
    def _pos_modern_shop_list(self):
        shops = self.env['pos.config'].search_read([('company_id', 'in', self.env.companies.ids)], ['name'], order='name')
        return [{'id': s['id'], 'name': s['name']} for s in shops]

    @api.model
    @_safe(([], [0] * 12))
    def _pos_modern_by_month(self, sold, today, end, as_dt):
        year_start = date_utils.start_of(today, 'year')

        def monthly(a, b):
            groups = self._read_group(
                sold + [('date_order', '>=', as_dt(a)), ('date_order', '<', as_dt(b))],
                ['date_order:month'], ['amount_total:sum'])
            return {month_key(m): v or 0.0 for m, v in groups if m}

        this_year = monthly(year_start, year_start + relativedelta(years=1))
        last_year = monthly(year_start - relativedelta(years=1), year_start)
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
        spark_map = monthly(spark_start, end)
        spark = [spark_map.get(spark_start + relativedelta(months=i), 0.0) for i in range(12)]
        return months, spark

    @api.model
    @_safe([])
    def _pos_modern_attention(self, scope, session_scope, today, as_dt):
        _ = self.env._
        Session = self.env['pos.session']
        yesterday = fields.Datetime.now() - timedelta(hours=24)
        items = []

        def add(key, tone, icon, label, model, domain, count=None):
            n = count if count is not None else self._pos_modern_try(
                lambda: self.env[model].search_count(domain), None)
            if n is not None:
                items.append({'key': key, 'count': n, 'tone': tone, 'icon': icon, 'label': label,
                              'model': model, 'domain': _json_domain(domain)})

        add('long', 'danger', 'fa-clock-o', _('Sessions open for more than a day'), 'pos.session',
            session_scope + [('state', '=', 'opened'), ('start_at', '<', yesterday)])
        add('closing', 'warning', 'fa-lock', _('Sessions waiting to be closed'), 'pos.session',
            session_scope + [('state', '=', 'closing_control')])
        add('rescue', 'warning', 'fa-life-ring', _('Rescue sessions'), 'pos.session',
            session_scope + [('rescue', '=', True), ('state', '!=', 'closed')])
        add('draft', 'info', 'fa-shopping-basket', _('Ongoing orders (not paid yet)'), 'pos.order',
            scope + [('state', '=', 'draft')])
        add('to_post', 'slate', 'fa-file-text-o', _('Paid orders not posted yet'), 'pos.order',
            scope + [('state', '=', 'paid')])
        add('refunds', 'warning', 'fa-undo', _('Refunds in the last 7 days'), 'pos.order',
            scope + [('amount_total', '<', 0), ('date_order', '>=', as_dt(today - timedelta(days=7)))])
        return items

    @api.model
    @_safe([])
    def _pos_modern_top_products(self, domain):
        Line = self.env['pos.order.line']
        line_domain = [('order_id.' + t[0], t[1], t[2]) if isinstance(t, tuple) else t for t in domain]
        groups = Line._read_group(line_domain, ['product_id'], ['price_subtotal_incl:sum', 'qty:sum'],
                                  order='price_subtotal_incl:sum desc', limit=7)
        return [{'id': p.id, 'label': p.display_name, 'value': total or 0.0,
                 'sub': self.env._('%s sold', round(qty or 0, 2))} for p, total, qty in groups if p]

    @api.model
    @_safe([])
    def _pos_modern_by_shop(self, domain):
        groups = self._read_group(domain, ['config_id'], ['amount_total:sum', '__count'],
                                  order='amount_total:sum desc', limit=8)
        return [{'id': c.id, 'label': c.name, 'value': total or 0.0,
                 'sub': self.env._('%s orders', count)} for c, total, count in groups if c]

    @api.model
    @_safe([])
    def _pos_modern_by_method(self, scope, start, end, as_dt):
        Payment = self.env['pos.payment']
        domain = [('pos_order_id.' + t[0], t[1], t[2]) for t in scope] + [
            ('payment_date', '>=', as_dt(start)), ('payment_date', '<', as_dt(end)),
            ('pos_order_id.state', 'in', SOLD)]
        groups = Payment._read_group(domain, ['payment_method_id'], ['amount:sum'], order='amount:sum desc')
        return [{'id': m.id, 'label': m.name, 'value': amount or 0.0}
                for m, amount in groups if m and (amount or 0) > 0]

    @api.model
    @_safe([])
    def _pos_modern_shops(self, config_id):
        Config = self.env['pos.config']
        domain = [('company_id', 'in', self.env.companies.ids)]
        if config_id:
            domain.append(('id', '=', config_id))
        states = dict(self.env['pos.session']._fields['state']._description_selection(self.env))
        rows = []
        for shop in Config.search(domain, limit=8):
            session = shop.current_session_id
            state = session.state if session else 'closed'
            rows.append({
                'key': shop.id,
                'label': shop.name,
                'count': session.order_count if session else 0,
                'sub': (states.get(state, state) + (' · ' + session.user_id.name if session and session.user_id else ''))
                if session else self.env._('Closed'),
                'tone': SESSION_TONES.get(state, 'slate'),
                'icon': 'fa-shopping-basket',
            })
        return rows

    @api.model
    @_safe([])
    def _pos_modern_recent(self, scope):
        names = ['name', 'pos_reference', 'date_order', 'partner_id', 'config_id', 'amount_total', 'state',
                 'currency_id', 'employee_id', 'user_id']
        names = [n for n in names if n in self._fields]
        return self.search_read(scope, names, order='date_order desc, id desc', limit=40)
