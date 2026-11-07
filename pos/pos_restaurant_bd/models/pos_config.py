from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError

from .kitchen import ORDER_TYPES

DELIVERY_PARTNERS = [('own', 'Own rider'), ('foodpanda', 'Foodpanda'), ('pathao', 'Pathao Food'),
                     ('shohoz', 'Shohoz Food'), ('other', 'Other')]


class PosConfig(models.Model):
    _inherit = 'pos.config'

    rb_restaurant = fields.Boolean(string="Restaurant counter", compute='_compute_rb_restaurant', store=True,
                                   readonly=False, help="Order types, kitchen tickets, service charge, QR menu.")
    rb_default_type = fields.Selection(ORDER_TYPES, string="Default order type", default='dine_in')
    rb_kitchen = fields.Boolean(string="Kitchen tickets (KOT) and kitchen screen", default=True)
    rb_print_kot = fields.Boolean(string="Print the KOT on the receipt printer", default=True)
    rb_late_minutes = fields.Integer(string="Ticket late after (minutes)", default=15)
    rb_service_pct = fields.Float(string="Service charge (%) on dine-in")
    rb_service_product_id = fields.Many2one('product.product', string="Service charge product")
    rb_delivery_product_id = fields.Many2one('product.product', string="Delivery charge product")
    rb_qr_menu = fields.Boolean(string="Public QR menu", default=True)
    rb_station_split = fields.Boolean(string="One kitchen ticket per station",
                                      help="Grill, tandoor, drinks… (the product's first PoS category) each get their own KOT.")

    @api.depends('module_pos_restaurant')
    def _compute_rb_restaurant(self):
        for config in self:
            config.rb_restaurant = bool(config.module_pos_restaurant)

    # ------------------------------------------------------------------ helpers
    def _rb_charge_product(self, field, name):
        self.ensure_one()
        product = self[field]
        code = {'rb_service_product_id': 'RB-SERVICE', 'rb_delivery_product_id': 'RB-DELIVERY'}[field]
        if not product:
            product = self.env['product.product'].sudo().search([('default_code', '=', code)], limit=1)
            if not product:
                product = self.env['product.product'].sudo().create({
                    'name': name, 'type': 'service', 'default_code': code,
                    'list_price': 0.0, 'sale_ok': True, 'available_in_pos': False, 'taxes_id': [(5, 0, 0)],
                })
            self.sudo()[field] = product
        return product

    def _rb_extra(self, payload):
        return (payload or {}).get('extra') or {}

    # ------------------------------------------------------------------ counter hooks
    def _pos_modern_features(self):
        features = super()._pos_modern_features()
        features.update({
            'rb': self.rb_restaurant,
            'kitchen': self.rb_restaurant and self.rb_kitchen,
            'print_kot': self.rb_print_kot,
            'default_order_type': self.rb_default_type or 'dine_in',
            'service_pct': self.rb_service_pct,
            'delivery_partners': [{'id': k, 'name': v} for k, v in DELIVERY_PARTNERS],
            'staff': [{'id': w.id, 'name': w.name, 'kind': w.kind} for w in self.env['pos.rb.staff'].search(
                ['|', ('config_ids', '=', False), ('config_ids', 'in', self.id),
                 ('company_id', 'in', [self.company_id.id, False])])] if self.rb_restaurant else [],
        })
        return features

    def _pos_modern_adjust_lines(self, lines, payload, partner):
        lines = super()._pos_modern_adjust_lines(lines, payload, partner)
        if not self.rb_restaurant or not lines:
            return lines
        extra = self._rb_extra(payload)
        order_type = extra.get('order_type') or self.rb_default_type or 'dine_in'
        for line in lines:
            if (line['extra'] or {}).get('comp'):
                line['discount'] = 100.0
                line['label'] = ' · '.join(filter(None, [line['label'], _('Complimentary')]))

        def charge(product, amount, key, label):
            taxes = product.taxes_id.filtered_domain(self.env['account.tax']._check_company_domain(self.company_id))
            return {
                'key': key, 'product': product, 'qty': 1.0, 'price_unit': self.currency_id.round(amount),
                'discount': 0.0, 'cashier_discount': 0.0, 'taxes': taxes, 'note': '', 'extra': {},
                'vals': {}, 'label': label, 'free': False,
            }

        if order_type == 'dine_in' and self.rb_service_pct > 0:
            base = sum(l['price_unit'] * l['qty'] * (1 - l['discount'] / 100.0) for l in lines if not l.get('refund'))
            if base > 0:
                product = self._rb_charge_product('rb_service_product_id', _('Service charge'))
                lines.append(charge(product, base * self.rb_service_pct / 100.0, 'rb-service',
                                    _('%s%% of the bill', self.rb_service_pct)))
        delivery = float(extra.get('delivery_charge') or 0.0)
        if order_type == 'delivery' and delivery > 0:
            product = self._rb_charge_product('rb_delivery_product_id', _('Delivery charge'))
            lines.append(charge(product, delivery, 'rb-delivery', extra.get('delivery_partner_label') or ''))
        return lines

    def _pos_modern_order_vals(self, vals, payload, quote, partner):
        vals = super()._pos_modern_order_vals(vals, payload, quote, partner)
        if not self.rb_restaurant:
            return vals
        extra = self._rb_extra(payload)
        order_type = extra.get('order_type') or self.rb_default_type or 'dine_in'
        vals['rb_order_type'] = order_type
        if order_type == 'delivery':
            vals.update({
                'rb_delivery_partner': extra.get('delivery_partner') or 'own',
                'rb_delivery_ref': (extra.get('delivery_ref') or '')[:64] or False,
                'rb_delivery_address': (extra.get('delivery_address') or '')[:256] or False,
            })
        guests = int(extra.get('guests') or 0)
        if guests:
            vals['customer_count'] = guests
        Staff = self.env['pos.rb.staff']
        if extra.get('waiter_id') and Staff.browse(int(extra['waiter_id'])).exists():
            vals['rb_waiter_id'] = int(extra['waiter_id'])
        if extra.get('rider_id') and Staff.browse(int(extra['rider_id'])).exists():
            vals['rb_rider_id'] = int(extra['rider_id'])
        return vals

    def _pos_modern_after_order(self, order, payload):
        res = super()._pos_modern_after_order(order, payload)
        if self.rb_restaurant and self.rb_kitchen:
            self._rb_make_ticket(payload, order=order)
        return res

    # ------------------------------------------------------------------ kitchen
    def _rb_make_ticket(self, payload, order=None):
        """Ticket of the items not sent to the kitchen yet (payload.extra.sent = {key: qty})."""
        self.ensure_one()
        extra = self._rb_extra(payload)
        sent = extra.get('sent') or {}
        products = self.env['product.product'].browse(
            [int(l['product_id']) for l in payload.get('lines') or []]).exists()
        by_id = {p.id: p for p in products}
        lines = []
        for line in payload.get('lines') or []:
            product = by_id.get(int(line['product_id']))
            if not product or product.type == 'service' and not product.pos_categ_ids:
                continue
            delta = float(line.get('qty') or 0) - float(sent.get(line.get('key') or str(product.id), 0))
            if delta > 0:
                lines.append((0, 0, {
                    'product_id': product.id,
                    'name': product.display_name,
                    'qty': delta,
                    'note': line.get('note') or '',
                    'station': product.pos_categ_ids[:1].name or '',
                }))
        if not lines:
            return self.env['pos.rb.ticket']
        partner = self._pos_modern_partner(payload.get('partner_id'))
        groups = {}
        for command in lines:
            station = command[2]['station'] if self.rb_station_split else ''
            groups.setdefault(station, []).append(command)
        Ticket = self.env['pos.rb.ticket']
        for station, station_lines in groups.items():
            Ticket |= Ticket.create({
                'config_id': self.id,
                'order_type': extra.get('order_type') or self.rb_default_type or 'dine_in',
                'table_name': payload.get('table_name') or '',
                'customer': partner.name or extra.get('delivery_ref') or '',
                'note': ' · '.join(filter(None, [station, payload.get('note') or ''])),
                'line_ids': station_lines,
                'order_id': order.id if order else False,
                'hold_ref': int(payload.get('hold_id') or 0),
            })
        return Ticket

    def pos_rb_send_kitchen(self, payload):
        """'Kitchen' button: ticket of the new items, the bill kept open (held) on its table."""
        self.ensure_one()
        payload = dict(payload or {})
        if not payload.get('lines'):
            raise UserError(_("The cart is empty."))
        tickets = self._rb_make_ticket(payload)
        extra = dict(self._rb_extra(payload))
        extra['sent'] = {l.get('key') or str(l['product_id']): float(l.get('qty') or 0) for l in payload['lines']}
        payload['extra'] = extra
        label = payload.get('table_name') or self._pos_modern_partner(payload.get('partner_id')).name or ''
        hold = self.pos_modern_hold(payload, label)
        tickets.filtered(lambda t: not t.hold_ref).write({'hold_ref': hold['id']})
        return {
            'hold': hold,
            'sent': extra['sent'],
            'ticket': tickets[:1]._rb_row() if tickets else False,
            'tickets': [t._rb_row() for t in tickets],
            'width': self.pm_receipt_width or '80',
        }

    # ------------------------------------------------------------------ tables: bill, move, merge
    def pos_rb_request_bill(self, payload):
        """Guest asks for the bill: keep the table's bill open, marked "bill asked", and give
        the totals to print the guest check."""
        self.ensure_one()
        payload = dict(payload or {})
        payload['extra'] = dict(self._rb_extra(payload), bill_requested=True)
        label = payload.get('table_name') or self._pos_modern_partner(payload.get('partner_id')).name or ''
        hold = self.pos_modern_hold(payload, label)
        quote = self._pos_modern_quote(payload)
        return {'hold': hold, 'quote': self._pos_modern_quote_json(quote)}

    def pos_rb_move(self, hold_id, table_id):
        """Move a table's open bill to another table; merged when that table has a bill."""
        self.ensure_one()
        Hold = self.env['pos.modern.hold']
        hold = Hold.browse(int(hold_id)).exists()
        table = self.env['restaurant.table'].browse(int(table_id)).exists()
        if not hold or not table:
            raise UserError(_("The bill or the table is gone."))
        name = '%s · %s' % (table.floor_id.name, table.table_number)
        target = Hold.search([('config_id', '=', self.id), ('table_ref', '=', table.id), ('id', '!=', hold.id)], limit=1)
        if not target:
            payload = dict(hold.payload or {}, table_id=table.id, table_name=name)
            hold.write({'table_ref': table.id, 'table_name': name, 'name': name, 'payload': payload})
            return {'moved': True, 'hold': hold._pos_modern_row()}
        # merge: the lines of both bills on the target table
        src, dst = dict(hold.payload or {}), dict(target.payload or {})
        lines = list(dst.get('lines') or [])
        keys = {l.get('key') for l in lines}
        src_sent = dict((src.get('extra') or {}).get('sent') or {})
        dst_extra = dict(dst.get('extra') or {})
        sent = dict(dst_extra.get('sent') or {})
        for line in src.get('lines') or []:
            line = dict(line)
            key = line.get('key') or str(line.get('product_id'))
            old_key = key
            while key in keys:
                key = '%s+' % key
            line['key'] = key
            keys.add(key)
            lines.append(line)
            if old_key in src_sent:
                sent[key] = src_sent[old_key]
        dst_extra['sent'] = sent
        dst_extra['guests'] = int(dst_extra.get('guests') or 0) + int((src.get('extra') or {}).get('guests') or 0)
        dst.update(lines=lines, extra=dst_extra)
        quote = self._pos_modern_quote(dst)
        target.write({'payload': dst, 'amount_total': quote['total'],
                      'item_count': sum(float(l.get('qty') or 0) for l in lines)})
        self.env['pos.rb.ticket'].search([('hold_ref', '=', hold.id)]).write({'hold_ref': target.id})
        hold.unlink()
        return {'moved': False, 'merged': True, 'hold': target._pos_modern_row()}

    @api.model
    def pos_modern_tables(self, config_id=False):
        data = super().pos_modern_tables(config_id)
        if not data.get('installed') or not data.get('config_id'):
            return data
        config = self.browse(data['config_id'])
        tables = {t.id: t for t in config.floor_ids.table_ids}
        holds = {h.table_ref: h for h in self.env['pos.modern.hold'].search(
            [('config_id', '=', config.id), ('table_ref', '!=', 0)])}
        staff = {s.id: s.name for s in self.env['pos.rb.staff'].search([])}
        now = fields.Datetime.now()
        for floor in data['floors']:
            for row in floor['tables']:
                table = tables.get(row['id'])
                if table:
                    row.update({'x': table.position_h, 'y': table.position_v, 'w': table.width or 80,
                                'h': table.height or 80})
                hold = holds.get(row['id'])
                if hold:
                    extra = (hold.payload or {}).get('extra') or {}
                    row.update({
                        'bill': bool(extra.get('bill_requested')),
                        'waiter': staff.get(int(extra.get('waiter_id') or 0), ''),
                        'guests': int(extra.get('guests') or 0),
                        'minutes': int((now - hold.create_date).total_seconds() // 60) if hold.create_date else 0,
                    })
        return data

    def pos_rb_kds(self):
        self.ensure_one()
        recent = fields.Datetime.now() - timedelta(minutes=30)
        tickets = self.env['pos.rb.ticket'].search([
            ('config_id', '=', self.id),
            '|', ('state', 'in', ('new', 'cooking')), '&', ('state', '=', 'ready'), ('ready_at', '>=', recent)])
        return {'config_id': self.id, 'name': self.name, 'tickets': [t._rb_row() for t in tickets]}

    @api.model
    def pos_rb_kds_shops(self):
        return [{'id': c.id, 'name': c.name} for c in self.search(
            [('company_id', 'in', self.env.companies.ids), ('rb_restaurant', '=', True)])]

    def action_rb_qr_cards(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_url', 'url': '/pos/menu/%s/qr' % self.id, 'target': 'new'}


class PosOrder(models.Model):
    _inherit = 'pos.order'

    rb_order_type = fields.Selection(ORDER_TYPES, string="Order type")
    rb_delivery_partner = fields.Selection(DELIVERY_PARTNERS, string="Delivered by")
    rb_delivery_ref = fields.Char(string="Delivery order no.")
    rb_delivery_address = fields.Char(string="Delivery address")
    rb_waiter_id = fields.Many2one('pos.rb.staff', string="Waiter", domain=[('kind', '=', 'waiter')])
    rb_rider_id = fields.Many2one('pos.rb.staff', string="Rider", domain=[('kind', '=', 'rider')])

    def _pos_modern_receipt_data(self):
        data = super()._pos_modern_receipt_data()
        if self.rb_order_type:
            data['extra']['order_type'] = dict(ORDER_TYPES).get(self.rb_order_type)
            if self.rb_order_type == 'delivery':
                data['extra']['delivery'] = {
                    'by': dict(DELIVERY_PARTNERS).get(self.rb_delivery_partner or 'own'),
                    'ref': self.rb_delivery_ref or '',
                    'address': self.rb_delivery_address or '',
                }
            if self.customer_count:
                data['extra']['guests'] = self.customer_count
            if self.rb_waiter_id:
                data['extra']['waiter'] = self.rb_waiter_id.name
            if self.rb_rider_id:
                data['extra']['rider'] = self.rb_rider_id.name
        return data

    def _pos_modern_order_result(self):
        result = super()._pos_modern_order_result()
        kot = self.env['pos.rb.ticket'].search([('order_id', '=', self.id)], order='id desc', limit=1)
        if kot:
            result['kot'] = kot._rb_row()
        return result


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _pos_modern_session_report_extra(self, report):
        report = super()._pos_modern_session_report_extra(report)
        orders = self.order_ids.filtered(lambda o: o.state in ('paid', 'done', 'invoiced') and o.rb_order_type)
        if not orders:
            return report
        covers = sum(orders.mapped('customer_count'))
        dine = orders.filtered(lambda o: o.rb_order_type == 'dine_in')
        waiters = {}
        for order in orders.filtered('rb_waiter_id'):
            entry = waiters.setdefault(order.rb_waiter_id.name, {'name': order.rb_waiter_id.name, 'count': 0, 'amount': 0.0})
            entry['count'] += 1
            entry['amount'] += order.amount_total
        report['extra']['restaurant'] = {
            'covers': covers,
            'per_cover': round(sum(dine.mapped('amount_total')) / covers, 2) if covers else 0.0,
            'types': [{'name': dict(ORDER_TYPES)[t], 'count': len(orders.filtered(lambda o: o.rb_order_type == t)),
                       'amount': sum(orders.filtered(lambda o: o.rb_order_type == t).mapped('amount_total'))}
                      for t in dict(ORDER_TYPES)],
            'waiters': sorted(waiters.values(), key=lambda w: -w['amount']),
        }
        return report
