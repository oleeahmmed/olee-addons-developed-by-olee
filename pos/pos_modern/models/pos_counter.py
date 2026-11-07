"""Modern POS counter: held bills, receipts and the day-end (X / Z) report.

* pos.modern.hold — a cart put aside ("hold bill") and taken back later, or an open
  table bill of a restaurant. It is not an order: nothing is counted until it is paid.
* pos.order._pos_modern_receipt_data() — what the thermal receipt prints. Shop addons
  extend it (TrxID, BIN / Mushak, Bangla names, lots and expiry…).
* pos.session.pos_modern_session_report() — X report (any time) and Z report (closing):
  sales, refunds, discounts, taxes, every payment method, cash expected vs counted,
  sales per cashier.
"""
from collections import defaultdict

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import format_datetime

SOLD = ('paid', 'done', 'invoiced')


class PosModernHold(models.Model):
    _name = 'pos.modern.hold'
    _description = 'Held bill (Modern POS)'
    _order = 'create_date desc, id desc'

    name = fields.Char(string='Label')
    config_id = fields.Many2one('pos.config', string='Shop', required=True, index=True, ondelete='cascade')
    company_id = fields.Many2one(related='config_id.company_id', store=True)
    user_id = fields.Many2one('res.users', string='Cashier', default=lambda self: self.env.user, readonly=True)
    partner_id = fields.Many2one('res.partner', string='Customer')
    table_ref = fields.Integer(string='Table', index=True, help="restaurant.table id (restaurant shops)")
    table_name = fields.Char(string='Table name')
    payload = fields.Json(string='Cart')
    amount_total = fields.Float(string='Total')
    item_count = fields.Float(string='Items')
    currency_id = fields.Many2one(related='config_id.currency_id')

    @api.depends('name', 'table_name', 'partner_id')
    def _compute_display_name(self):
        for hold in self:
            label = hold.name or hold.table_name or hold.partner_id.name
            hold.display_name = label or _('Bill #%s', hold.id)

    def _pos_modern_row(self):
        self.ensure_one()
        return {
            'id': self.id,
            'name': self.display_name,
            'label': self.name or '',
            'partner': [self.partner_id.id, self.partner_id.name] if self.partner_id else False,
            'table_id': self.table_ref or False,
            'table_name': self.table_name or '',
            'total': self.amount_total,
            'items': self.item_count,
            'user': self.user_id.name,
            'date': fields.Datetime.to_string(self.create_date) if self.create_date else False,
            'payload': self.payload or {},
        }

    def pos_modern_take(self):
        """The cart of a held bill (the bill is removed once the order is paid)."""
        self.ensure_one()
        return self._pos_modern_row()


class PosModernModifier(models.Model):
    """Extras and choices of a product at the counter: "less spicy", "extra cheese +৳40",
    "double shot", "1 pound / chocolate"… Price added to the line, names printed on the bill
    and the kitchen ticket."""
    _name = 'pos.modern.modifier'
    _description = 'Product modifier (Modern POS)'
    _order = 'group_name, sequence, id'

    name = fields.Char(required=True, translate=True)
    group_name = fields.Char(string='Group', help="Spice, Size, Toppings… one choice per group when 'Pick one' is set.")
    single = fields.Boolean(string='Pick one in the group')
    price_extra = fields.Float(string='Extra price')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company)
    pos_categ_ids = fields.Many2many('pos.category', string='PoS categories')
    product_tmpl_ids = fields.Many2many('product.template', string='Products')

    @api.model
    def _pos_modern_active(self, config):
        return self.search([('company_id', 'in', [config.company_id.id, False])])

    @api.model
    def _pos_modern_rows(self, config):
        return [{'id': m.id, 'name': m.name, 'group': m.group_name or '', 'single': m.single,
                 'price': m.price_extra} for m in self._pos_modern_active(config)]

    @api.model
    def _pos_modern_map(self, config, products):
        """{product_id: [modifier ids]} — a modifier applies to its products and categories."""
        mods = self._pos_modern_active(config)
        if not mods:
            return {}
        result = {}
        for product in products:
            ids = [m.id for m in mods if product.product_tmpl_id in m.product_tmpl_ids
                   or (product.pos_categ_ids & m.pos_categ_ids)]
            if ids:
                result[product.id] = ids
        return result


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _pos_modern_order_result(self):
        self.ensure_one()
        return {
            'id': self.id,
            'name': self.pos_reference or self.name,
            'total': self.amount_total,
            'state': self.state,
            'uuid': self.uuid,
            'receipt': self._pos_modern_receipt_data(),
        }

    def pos_modern_receipt(self):
        """Receipt of an order (reprint from the counter or the order list)."""
        self.ensure_one()
        return self._pos_modern_receipt_data()

    def _pos_modern_receipt_lines(self):
        self.ensure_one()
        rows = []
        incl = self.config_id.iface_tax_included == 'total'
        for line in self.lines:
            factor = (1 - (line.discount or 0.0) / 100.0) * (line.qty or 1.0)
            shown_total = line.price_subtotal_incl if incl else line.price_subtotal
            rows.append({
                'price_display': (shown_total / factor) if factor else line.price_unit,
                'total_display': shown_total,
                'id': line.id,
                'product_id': line.product_id.id,
                'name': line.full_product_name or line.product_id.display_name,
                'code': line.product_id.default_code or '',
                'qty': line.qty,
                'uom': line.product_uom_id.name or '',
                'price_unit': line.price_unit,
                'discount': line.discount,
                'total': line.price_subtotal_incl,
                'untaxed': line.price_subtotal,
                'note': line.customer_note or '',
                'lots': line.pack_lot_ids.mapped('lot_name'),
                'tax_ids': line.tax_ids.ids,
            })
        return rows

    def _pos_modern_receipt_taxes(self):
        """Tax amounts of the order, per tax (VAT 15 %, VAT 7.5 %, SD…)."""
        self.ensure_one()
        currency = self.currency_id
        taxes = {}
        for line in self.lines:
            if not line.tax_ids:
                continue
            fpos_taxes = self.fiscal_position_id.map_tax(line.tax_ids) if self.fiscal_position_id else line.tax_ids
            price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
            res = fpos_taxes.compute_all(price, currency, line.qty, product=line.product_id,
                                         partner=self.partner_id or None)
            for tax in res['taxes']:
                record = self.env['account.tax'].browse(tax['id'])
                entry = taxes.setdefault(tax['id'], {
                    'id': tax['id'], 'name': tax['name'], 'amount': 0.0, 'base': 0.0,
                    'rate': record.amount if record.amount_type == 'percent' else 0.0,
                })
                entry['amount'] += tax['amount']
                entry['base'] += tax['base']
        return [dict(t, amount=currency.round(t['amount']), base=currency.round(t['base'])) for t in taxes.values()]

    def _pos_modern_receipt_data(self):
        self.ensure_one()
        config = self.config_id
        currency = self.currency_id
        lines = self._pos_modern_receipt_lines()
        gross = sum(l['price_unit'] * l['qty'] for l in lines)
        cashier = self.user_id.name
        if 'employee_id' in self._fields and self.employee_id:
            cashier = self.employee_id.name
        partner = self.partner_id
        payments = [{
            'name': p.payment_method_id.name,
            'amount': p.amount,
            'ref': p.transaction_id or '',
            'method_id': p.payment_method_id.id,
        } for p in self.payment_ids if not p.is_change]
        return {
            'id': self.id,
            'uuid': self.uuid,
            'ref': self.pos_reference or self.name,
            'number': self.tracking_number or '',
            'date': format_datetime(self.env, self.date_order, dt_format='dd/MM/yyyy HH:mm'),
            'shop': config.name,
            'session': self.session_id.name,
            'cashier': cashier,
            'customer': {
                'name': partner.name,
                'phone': partner.phone or '',
                'address': ', '.join(x for x in [partner.street, partner.city] if x),
                'vat': partner.vat or '',
            } if partner else False,
            'company': config._pos_modern_company_info(),
            'header': config.receipt_header or '',
            'footer': config.receipt_footer or '',
            'width': config.pm_receipt_width or '80',
            'currency_id': currency.id,
            'lines': lines,
            'taxes': self._pos_modern_receipt_taxes(),
            'untaxed': self.amount_total - self.amount_tax,
            'tax': self.amount_tax,
            'total': self.amount_total,
            'discount': currency.round(max(0.0, sum(l['price_unit'] * l['qty'] * l['discount'] / 100.0 for l in lines))),
            'gross': gross,
            'paid': self.amount_paid,
            'change': self.amount_return,
            'payments': payments,
            'note': self.general_customer_note or '',
            'refund': self.amount_total < 0,
            'exchange': any(l.qty < 0 for l in self.lines) and any(l.qty > 0 for l in self.lines),
            'table': self.table_id.display_name if 'table_id' in self._fields and self.table_id else '',
            'extra': {},
        }


class PosSession(models.Model):
    _inherit = 'pos.session'

    def pos_modern_session_report(self):
        """X report (session open) / Z report (session closed)."""
        self.ensure_one()
        currency = self.currency_id
        orders = self.order_ids.filtered(lambda o: o.state in SOLD)
        sales = orders.filtered(lambda o: o.amount_total >= 0)
        refunds = orders - sales
        methods = defaultdict(lambda: {'count': 0, 'amount': 0.0})
        for payment in orders.payment_ids:
            entry = methods[payment.payment_method_id]
            entry['amount'] += payment.amount
            if not payment.is_change:
                entry['count'] += 1
        by_user = defaultdict(lambda: {'count': 0, 'amount': 0.0})
        for order in orders:
            name = order.employee_id.name if 'employee_id' in order._fields and order.employee_id else order.user_id.name
            by_user[name or _('Unknown')]['count'] += 1
            by_user[name or _('Unknown')]['amount'] += order.amount_total
        discount = 0.0
        products = defaultdict(lambda: {'qty': 0.0, 'amount': 0.0})
        for line in orders.lines:
            discount += line.price_unit * line.qty * (line.discount or 0.0) / 100.0
            products[line.product_id.display_name]['qty'] += line.qty
            products[line.product_id.display_name]['amount'] += line.price_subtotal_incl
        # cash in / out typed at the counter or the register ("<session>-in-<reason>"); the
        # lines Odoo adds when the session is closed (cash sales, difference) are left out
        prefix = (self.name or '') + '-'
        cash_moves = [{
            'name': line.payment_ref or '',
            'amount': line.amount,
        } for line in self.sudo().statement_line_ids if (line.payment_ref or '').startswith(prefix)]
        taxes = defaultdict(float)
        for order in orders:
            for tax in order._pos_modern_receipt_taxes():
                taxes[tax['name']] += tax['amount']
        report = {
            'id': self.id,
            'name': self.name,
            'shop': self.config_id.name,
            'company': self.config_id._pos_modern_company_info(),
            'state': self.state,
            'kind': 'Z' if self.state == 'closed' else 'X',
            'user': self.user_id.name,
            'start_at': format_datetime(self.env, self.start_at, dt_format='dd/MM/yyyy HH:mm') if self.start_at else '',
            'stop_at': format_datetime(self.env, self.stop_at, dt_format='dd/MM/yyyy HH:mm') if self.stop_at else '',
            'printed_at': format_datetime(self.env, fields.Datetime.now(), dt_format='dd/MM/yyyy HH:mm'),
            'currency_id': currency.id,
            'width': self.config_id.pm_receipt_width or '80',
            'orders': len(sales),
            'sales': currency.round(sum(sales.mapped('amount_total'))),
            'refund_count': len(refunds),
            'refunds': currency.round(-sum(refunds.mapped('amount_total'))),
            'net': currency.round(sum(orders.mapped('amount_total'))),
            'tax': currency.round(sum(orders.mapped('amount_tax'))),
            'taxes': [{'name': k, 'amount': currency.round(v)} for k, v in taxes.items()],
            'discount': currency.round(discount),
            'average': currency.round(sum(sales.mapped('amount_total')) / len(sales)) if sales else 0.0,
            'methods': [{
                'id': m.id, 'name': m.name, 'is_cash': m.is_cash_count, 'type': m.type,
                'count': v['count'], 'amount': currency.round(v['amount']),
            } for m, v in sorted(methods.items(), key=lambda kv: -kv[1]['amount'])],
            'cashiers': [{'name': k, 'count': v['count'], 'amount': currency.round(v['amount'])}
                         for k, v in sorted(by_user.items(), key=lambda kv: -kv[1]['amount'])],
            'products': [{'name': k, 'qty': v['qty'], 'amount': currency.round(v['amount'])}
                         for k, v in sorted(products.items(), key=lambda kv: -kv[1]['amount'])[:10]],
            'cash_control': self.config_id.cash_control,
            'cash': self._pos_modern_cash_block(methods, cash_moves),
            'open_orders': len(self.order_ids.filtered(lambda o: o.state == 'draft')),
            'extra': {},
        }
        return self._pos_modern_session_report_extra(report)

    def _pos_modern_cash_block(self, methods, cash_moves):
        currency = self.currency_id
        sales = currency.round(sum(v['amount'] for m, v in methods.items() if m.is_cash_count))
        moves_total = currency.round(sum(m['amount'] for m in cash_moves))
        expected = currency.round(self.cash_register_balance_start + sales + moves_total)
        counted = self.cash_register_balance_end_real if self.state in ('closing_control', 'closed') else False
        return {
            'opening': self.cash_register_balance_start,
            'moves': cash_moves,
            'moves_total': moves_total,
            'sales': sales,
            'expected': expected,
            'counted': counted,
            'difference': currency.round(counted - expected) if counted is not False else False,
        }

    def _pos_modern_session_report_extra(self, report):
        """Shop addons add blocks (mobile wallets, VAT, kitchen…)."""
        return report

    def pos_modern_cash_move(self, kind, amount, reason=''):
        """Cash in / out of the drawer (Odoo's own cash move)."""
        self.ensure_one()
        amount = float(amount or 0.0)
        if amount <= 0:
            raise UserError(_("Type an amount."))
        kind = 'in' if kind == 'in' else 'out'
        self.try_cash_in_out(kind, amount, reason or (_('Cash in') if kind == 'in' else _('Cash out')), False,
                             {'translatedType': _('in') if kind == 'in' else _('out'),
                              'formattedAmount': str(amount)})
        return self.pos_modern_session_report()

    def pos_modern_close(self, counted_cash=0.0, notes=''):
        """Day end from the counter: count the drawer, close the session, give the Z report."""
        self.ensure_one()
        if self.state == 'closed':
            return {'successful': True, 'report': self.pos_modern_session_report()}
        if self.state == 'opened':
            if self.config_id.cash_control:
                result = self.post_closing_cash_details(float(counted_cash or 0.0))
                if not result.get('successful'):
                    return result
            self.update_closing_control_state_session(notes or '')
        result = self.close_session_from_ui()
        if not result.get('successful'):
            return result
        return {'successful': True, 'report': self.pos_modern_session_report()}


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def pos_modern_day_report(self):
        """X report of the shop's current session (or the last closed one)."""
        self.ensure_one()
        session = self.current_session_id or self.env['pos.session'].search(
            [('config_id', '=', self.id)], order='id desc', limit=1)
        if not session:
            raise UserError(_("%s has no session yet.", self.name))
        return session.pos_modern_session_report()
