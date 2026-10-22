"""Inventory Modern: owner dashboard and the standard views the pages embed.

Read-only, with the user's own rights (record rules and multi-company apply), from
Odoo's standard models only: stock.quant, stock.picking, stock.move(.line),
stock.warehouse(.orderpoint), product.product. No stored data of its own.
"""
import functools
from datetime import datetime, time, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import local_midnight
from odoo.tools import date_utils

PERIODS = ('month', 'quarter', 'year')
OPEN_STATES = ('draft', 'waiting', 'confirmed', 'assigned')
PICKING_FIELDS = ['name', 'state', 'partner_id', 'picking_type_id', 'picking_type_code', 'scheduled_date',
                  'date_deadline', 'date_done', 'origin', 'priority', 'user_id', 'location_id', 'location_dest_id']
CODES = ('incoming', 'outgoing', 'internal')


def period_bounds(today, period):
    """(start, end, prev_start, prev_end): the period so far and the same span just before it."""
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
    if not previous:
        return None
    return round((current - previous) * 100.0 / abs(previous), 1)


def month_key(value):
    value = value.date() if hasattr(value, 'date') else value
    return value.replace(day=1)


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    # ------------------------------------------------------------------
    # Owner dashboard
    # ------------------------------------------------------------------

    @api.model
    def inventory_modern_dashboard(self, period='month', warehouse_id=False):
        as_dt = functools.partial(as_dt_tz, tz=self.env.tz)
        today = fields.Date.context_today(self)
        now = fields.Datetime.now()
        start, end, prev_start, prev_end = period_bounds(today, period)
        Quant = self.env['stock.quant']
        Line = self.env['stock.move.line']
        Product = self.env['product.product']
        warehouse = self.env['stock.warehouse'].browse(int(warehouse_id)).exists() if warehouse_id else False

        internal = [('location_id.usage', '=', 'internal')]
        if warehouse:
            internal.append(('location_id', 'child_of', warehouse.view_location_id.id))
        pick_wh = [('picking_type_id.warehouse_id', '=', warehouse.id)] if warehouse else []

        # ---------- what is on the shelves: quantity and value (cost × quantity) ----------
        # Cost is per company (standard_price is company dependent) and in that company's
        # currency: value each company's quants with its own cost, then convert.
        company = self.env.company
        on_hand, value_by_product = {}, {}
        for p, c, q in Quant._read_group(internal, ['product_id', 'company_id'], ['quantity:sum']):
            q = q or 0.0
            on_hand[p] = on_hand.get(p, 0.0) + q
            src = c or company
            unit = p.with_company(src).standard_price
            if src.currency_id != company.currency_id:
                unit = src.currency_id._convert(unit, company.currency_id, company, today)
            value_by_product[p.id] = value_by_product.get(p.id, 0.0) + (q * unit if q > 0 else 0.0)
        # average unit cost of what is on hand, used for the per-product figures below
        cost = {p.id: (value_by_product.get(p.id, 0.0) / q) if q > 0 else p.standard_price for p, q in on_hand.items()}
        stock_value = sum(value_by_product.values())
        in_stock = sum(1 for q in on_hand.values() if q > 0)
        negative = sum(1 for q in on_hand.values() if q < 0)
        storable = Product.search_count([('is_storable', '=', True)])
        stocked_ids = {p.id for p, q in on_hand.items() if q > 0}
        out_of_stock_domain = [('is_storable', '=', True), ('id', 'not in', list(stocked_ids))]
        out_of_stock = Product.search_count(out_of_stock_domain)

        # ---------- replenishment (Odoo's reordering rules) ----------
        Orderpoint = self.env['stock.warehouse.orderpoint']
        # Same rules as Odoo's Replenishment screen: automatic and manual rules with
        # something to order, minus the snoozed ones.
        op_domain = [
            ('qty_to_order', '>', 0),
            '|', ('snoozed_until', '=', False), ('snoozed_until', '<=', today),
        ] + ([('warehouse_id', '=', warehouse.id)] if warehouse else [])
        to_reorder = 0
        low_stock = []
        if Orderpoint.browse().has_access('read'):
            ops = Orderpoint.search(op_domain)
            to_reorder = len(ops)
            for op in ops.sorted(lambda o: (o.qty_forecast - o.product_min_qty))[:6]:
                low_stock.append({
                    'id': op.id, 'product_id': op.product_id.id, 'label': op.product_id.display_name,
                    'forecast': op.qty_forecast, 'min': op.product_min_qty, 'to_order': op.qty_to_order,
                    'uom': op.product_id.uom_id.name,
                })

        # ---------- operations ----------
        def count(domain):
            return self.search_count(domain + pick_wh)

        ops = []
        # Internal transfers only exist with several locations (same setting as Odoo's menu)
        codes = CODES if self.env.user.has_group('stock.group_stock_multi_locations') else CODES[:2]
        for code in codes:
            base = [('picking_type_code', '=', code)]
            ops.append({
                'code': code,
                'draft': count(base + [('state', '=', 'draft')]),
                'waiting': count(base + [('state', 'in', ('waiting', 'confirmed'))]),
                'ready': count(base + [('state', '=', 'assigned')]),
                'late': count(base + [('state', 'in', ('confirmed', 'waiting', 'assigned')), ('scheduled_date', '<', now)]),
                'today': count(base + [('state', 'in', OPEN_STATES), ('scheduled_date', '>=', as_dt(today)), ('scheduled_date', '<', as_dt(end))]),
                'done': count(base + [('state', '=', 'done'), ('date_done', '>=', as_dt(start)), ('date_done', '<', as_dt(end))]),
                'done_prev': count(base + [('state', '=', 'done'), ('date_done', '>=', as_dt(prev_start)), ('date_done', '<', as_dt(prev_end))]),
            })
        by_code = {o['code']: o for o in ops}
        for o in ops:
            o['done_delta'] = delta(o['done'], o['done_prev'])

        # ---------- movements: units in and out ----------
        line_wh = []
        if warehouse:
            line_wh = ['|', ('location_id', 'child_of', warehouse.view_location_id.id),
                       ('location_dest_id', 'child_of', warehouse.view_location_id.id)]
        done_lines = [('state', '=', 'done')] + line_wh

        def units(code, a, b):
            [(qty,)] = Line._read_group(done_lines + [('picking_code', '=', code), ('date', '>=', as_dt(a)), ('date', '<', as_dt(b))],
                                        aggregates=['quantity_product_uom:sum'])
            return qty or 0.0

        units_out, units_out_prev = units('outgoing', start, end), units('outgoing', prev_start, prev_end)
        units_in, units_in_prev = units('incoming', start, end), units('incoming', prev_start, prev_end)

        year_start = date_utils.start_of(today, 'year')

        def monthly(code, a, b):
            return {month_key(m): q or 0.0 for m, q in Line._read_group(
                done_lines + [('picking_code', '=', code), ('date', '>=', as_dt(a)), ('date', '<', as_dt(b))],
                ['date:month'], ['quantity_product_uom:sum'])}

        out_this = monthly('outgoing', year_start, year_start + relativedelta(years=1))
        out_last = monthly('outgoing', year_start - relativedelta(years=1), year_start)
        in_this = monthly('incoming', year_start, year_start + relativedelta(years=1))
        months = []
        for i in range(12):
            month = year_start + relativedelta(months=i)
            months.append({'label': month.strftime('%b'), 'value': out_this.get(month, 0.0),
                           'previous': out_last.get(month - relativedelta(years=1), 0.0),
                           'incoming': in_this.get(month, 0.0), 'future': month > today})
        spark_start = date_utils.start_of(today, 'month') - relativedelta(months=11)
        spark_out = monthly('outgoing', spark_start, end)
        spark_in = monthly('incoming', spark_start, end)
        sparks = {'out': [], 'in': []}
        for i in range(12):
            month = spark_start + relativedelta(months=i)
            sparks['out'].append(spark_out.get(month, 0.0))
            sparks['in'].append(spark_in.get(month, 0.0))

        # ---------- products: best movers and sleeping stock ----------
        movers = []
        for product, qty in Line._read_group(
                done_lines + [('picking_code', '=', 'outgoing'), ('date', '>=', as_dt(start)), ('date', '<', as_dt(end))],
                ['product_id'], ['quantity_product_uom:sum'], order='quantity_product_uom:sum desc', limit=6):
            movers.append({'id': product.id, 'label': product.display_name, 'value': qty or 0.0,
                           'uom': product.uom_id.name, 'on_hand': on_hand.get(product, 0.0)})
        since_90 = now - timedelta(days=90)
        moved_90 = {p.id for [p] in Line._read_group(
            done_lines + [('picking_code', '=', 'outgoing'), ('date', '>=', since_90)], ['product_id'])}
        sleeping = sorted(
            ({'id': p.id, 'label': p.display_name, 'qty': q, 'value': q * cost.get(p.id, 0.0), 'uom': p.uom_id.name}
             for p, q in on_hand.items() if q > 0 and p.id not in moved_90),
            key=lambda r: r['value'], reverse=True)
        sleeping_value = sum(r['value'] for r in sleeping)

        # ---------- where the stock is ----------
        by_category = {}
        for p, q in on_hand.items():
            if q > 0:
                key = p.categ_id
                by_category[key] = by_category.get(key, 0.0) + q * cost.get(p.id, 0.0)
        categories = sorted(({'id': c.id, 'label': c.display_name or self.env._('No category'), 'value': v}
                             for c, v in by_category.items()), key=lambda r: r['value'], reverse=True)
        if len(categories) > 6:
            rest = sum(c['value'] for c in categories[6:])
            categories = categories[:6] + [{'id': 0, 'label': self.env._('Other'), 'value': rest}]
        warehouses = []
        for wh in self.env['stock.warehouse'].search([('id', '=', warehouse.id)] if warehouse else []):
            wh_quants = {p: q or 0.0 for p, q in Quant._read_group(
                [('location_id.usage', '=', 'internal'), ('location_id', 'child_of', wh.view_location_id.id)],
                ['product_id'], ['quantity:sum'])}
            warehouses.append({
                'id': wh.id, 'label': wh.name, 'code': wh.code,
                'value': sum(q * cost.get(p.id, p.standard_price) for p, q in wh_quants.items() if q > 0),
                'products': sum(1 for q in wh_quants.values() if q > 0),
            })
        warehouses.sort(key=lambda r: r['value'], reverse=True)
        warehouses = warehouses[:8]  # the biggest ones, after sorting

        # ---------- needs attention ----------
        late_receipts, late_deliveries = by_code['incoming']['late'], by_code['outgoing']['late']
        waiting_deliveries = count([('picking_type_code', '=', 'outgoing'), ('state', 'in', ('confirmed', 'waiting'))])
        backorders = count([('backorder_id', '!=', False), ('state', 'in', OPEN_STATES)])
        attention = [
            {'key': 'late_out', 'count': late_deliveries, 'tone': 'danger', 'icon': 'fa-truck',
             'label': self.env._('Late deliveries')},
            {'key': 'late_in', 'count': late_receipts, 'tone': 'warning', 'icon': 'fa-download',
             'label': self.env._('Late receipts')},
            {'key': 'waiting_out', 'count': waiting_deliveries, 'tone': 'info', 'icon': 'fa-hourglass-half',
             'label': self.env._('Deliveries waiting for stock')},
            {'key': 'reorder', 'count': to_reorder, 'tone': 'violet', 'icon': 'fa-refresh',
             'label': self.env._('Products to reorder')},
            {'key': 'out_of_stock', 'count': out_of_stock, 'tone': 'rose', 'icon': 'fa-ban',
             'label': self.env._('Storable products out of stock')},
            {'key': 'backorders', 'count': backorders, 'tone': 'muted', 'icon': 'fa-clone',
             'label': self.env._('Open backorders')},
        ]
        if negative:
            attention.append({'key': 'negative', 'count': negative, 'tone': 'danger', 'icon': 'fa-minus-circle',
                              'label': self.env._('Products with negative stock')})

        upcoming = self.search_read(
            [('state', 'in', ('confirmed', 'waiting', 'assigned'))] + pick_wh, PICKING_FIELDS,
            order='scheduled_date asc', limit=8)
        recent = self.search_read([('state', '=', 'done')] + pick_wh, PICKING_FIELDS, order='date_done desc', limit=7)

        currency = self.env.company.currency_id
        return {
            'currency_id': currency.id,
            'lakh': currency.name == 'BDT',
            'period': period if period in PERIODS else 'month',
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'now': fields.Datetime.to_string(now),
            'year': today.year,
            'kpis': {
                'stock_value': stock_value, 'in_stock': in_stock, 'storable': storable,
                'out_of_stock': out_of_stock, 'to_reorder': to_reorder, 'negative': negative,
                'units_out': units_out, 'units_out_delta': delta(units_out, units_out_prev),
                'units_in': units_in, 'units_in_delta': delta(units_in, units_in_prev),
                'sleeping_value': sleeping_value, 'sleeping_count': len(sleeping),
            },
            'ops': ops,
            'sparks': sparks,
            'months': months,
            'movers': movers,
            'sleeping': sleeping[:6],
            'categories': categories,
            'warehouses': warehouses,
            'low_stock': low_stock,
            'attention': attention,
            'upcoming': upcoming,
            'recent': recent,
            'warehouse_options': self.env['stock.warehouse'].search_read([], ['name'], order='sequence, name'),
            'company': self.env.company.name,
        }

    # ------------------------------------------------------------------
    # Standard views embedded in the pages (resolved by xml id; a missing
    # one falls back to the model's default view instead of breaking)
    # ------------------------------------------------------------------

    @api.model
    def inventory_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        picking = {
            'list': ref('stock.vpicktree'),
            'kanban': ref('stock.stock_picking_kanban'),
            'calendar': ref('stock.stock_picking_calendar'),
            'activity': ref('stock.stock_picking_view_activity'),
            'form': ref('stock.view_picking_form'),
            'search': ref('stock.view_picking_internal_search'),
        }
        ids = {
            'product_kanban': ref('stock.product_template_kanban_stock_view'),
            'product_list': ref('stock.view_stock_product_template_tree'),
            'product_search': ref('stock.product_template_search_form_view_stock'),
            'product_form': ref('product.product_template_form_view'),
            'quant_list': ref('stock.view_stock_quant_tree'),
            'quant_pivot': ref('stock.view_stock_quant_pivot'),
            'quant_search': ref('stock.quant_search_view'),
            'moveline_list': ref('stock.view_move_line_tree'),
            'moveline_kanban': ref('stock.view_stock_move_line_kanban'),
            'moveline_pivot': ref('stock.view_stock_move_line_pivot'),
            'moveline_search': ref('stock.stock_move_line_view_search'),
            'moveline_form': ref('stock.view_move_line_form'),
        }
        for prefix in ('receipt', 'delivery', 'internal'):
            for view_type, view_id in picking.items():
                ids[f'{prefix}_{view_type}'] = view_id
        return ids
