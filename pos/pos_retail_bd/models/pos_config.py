import math

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_compare, format_datetime
from odoo.tools.misc import formatLang


class PosConfig(models.Model):
    _inherit = 'pos.config'

    rt_offers = fields.Boolean(string="Offers", default=True)
    rt_points = fields.Boolean(string="Loyalty points")
    rt_points_per = fields.Float(string="1 point for every", default=100.0, help="Taka spent for one point.")
    rt_point_value = fields.Float(string="1 point is worth", default=1.0, help="Taka off when a point is redeemed.")
    rt_min_redeem = fields.Float(string="Redeem from (points)", default=50.0)
    rt_credit = fields.Boolean(string="Baki (customer account)",
                               help="Sell on credit with Odoo's 'Customer Account' payment method, up to each customer's limit.")
    rt_due_journal_id = fields.Many2one('account.journal', string="Collect dues in",
                                        domain="[('type', 'in', ('cash', 'bank'))]")
    rt_scale_prefixes = fields.Char(string="Scale barcode prefixes", default="21,22,23,24,25,26,27,28,29",
                                    help="EAN-13 barcodes of the weighing scale: 2 prefix digits, 5-digit product code (internal reference), 5-digit value, check digit.")
    rt_godown_location_id = fields.Many2one('stock.location', string="Godown (back store)",
                                            domain="[('usage', '=', 'internal')]",
                                            help="Its stock shows on the product cards next to the shelf stock.")
    rt_ask_serial = fields.Boolean(string="Ask the IMEI / serial number",
                                   help="Products tracked by serial number (mobiles, electronics) ask it at the counter.")
    rt_scale_mode = fields.Selection([('weight', 'Weight in grams'), ('price', 'Price in poisha')],
                                     string="Scale barcode value", default='weight')

    # ------------------------------------------------------------------ helpers
    def _rt_redeem_product(self):
        product = self.env['product.product'].sudo().search([('default_code', '=', 'RT-POINTS')], limit=1)
        if not product:
            product = self.env['product.product'].sudo().create({
                'name': _('Loyalty points'), 'type': 'service', 'default_code': 'RT-POINTS', 'list_price': 0.0,
                'sale_ok': True, 'available_in_pos': False, 'taxes_id': [(5, 0, 0)],
            })
        return product

    # ------------------------------------------------------------------ counter hooks
    def _pos_modern_features(self):
        features = super()._pos_modern_features()
        features.update({
            'retail': True,
            'points': self.rt_points,
            'point_value': self.rt_point_value,
            'min_redeem': self.rt_min_redeem,
            'credit': self.rt_credit,
            'collect_due': bool(self.rt_due_journal_id),
            'scale_prefixes': [p.strip() for p in (self.rt_scale_prefixes or '').split(',') if p.strip()],
            'scale_mode': self.rt_scale_mode or 'weight',
            'ask_serial': self.rt_ask_serial,
            'godown': bool(self.rt_godown_location_id),
        })
        return features

    def _pos_modern_extend_rows(self, products, rows):
        rows = super()._pos_modern_extend_rows(products, rows)
        godown = self.rt_godown_location_id
        stock = {}
        if godown:
            storable = products.filtered('is_storable').with_context(location=godown.id)
            stock = {p.id: p.qty_available for p in storable}
        for product, row in zip(products, rows):
            tmpl = product.product_tmpl_id
            if tmpl.rt_pack_qty and tmpl.rt_pack_qty > 1:
                row['pack_name'] = tmpl.rt_pack_name or _('Pack')
                row['pack_qty'] = tmpl.rt_pack_qty
            if tmpl.rt_quick:
                row['quick'] = True
            if product.id in stock:
                row['godown'] = stock[product.id]
        return rows

    def _pos_modern_allowed_methods(self, partner=False):
        methods = super()._pos_modern_allowed_methods(partner)
        if self.rt_credit:
            methods |= self.payment_method_ids.filtered(lambda pm: pm.type == 'pay_later')
        return methods

    def _pos_modern_customer_row(self, partner):
        row = super()._pos_modern_customer_row(partner)
        row.update({
            'points': partner.rt_points,
            'credit_limit': partner.rt_credit_limit,
            'due': partner._rt_due() if self.rt_credit else 0.0,
        })
        return row

    def _pos_modern_adjust_lines(self, lines, payload, partner):
        lines = super()._pos_modern_adjust_lines(lines, payload, partner)
        for line in lines:
            extra = line['extra'] or {}
            if extra.get('pack') and line['qty'] > 0:
                line['label'] = ' · '.join(filter(None, [line['label'], '%s %s' % (
                    extra['pack'], line['product'].product_tmpl_id.rt_pack_name or _('Pack'))]))
            serial = (extra.get('serial') or '').strip()
            if serial and line['qty'] > 0:
                self._rt_check_serial(line['product'], serial)
                line['vals']['pack_lot_ids'] = [(0, 0, {'lot_name': serial})]
                line['label'] = ' · '.join(filter(None, [line['label'], _('IMEI / SN %s', serial)]))
            elif self.rt_ask_serial and line['product'].tracking == 'serial' and line['qty'] > 0 and not line.get('refund'):
                raise UserError(_("Type the IMEI / serial number of %s.", line['product'].display_name))
        if self.rt_offers and lines:
            lines = self._rt_apply_offers(lines)
        redeem = float((payload.get('extra') or {}).get('redeem_points') or 0.0)
        if self.rt_points and redeem > 0:
            if not partner:
                raise UserError(_("Choose the customer to redeem points."))
            if redeem < (self.rt_min_redeem or 0.0):
                raise UserError(_("Points can be redeemed from %s points.", self.rt_min_redeem))
            if float_compare(redeem, partner.rt_points, precision_digits=2) > 0:
                raise UserError(_("%(name)s has only %(points)s points.", name=partner.name, points=partner.rt_points))
            value = self.currency_id.round(redeem * (self.rt_point_value or 0.0))
            total = sum(l['price_unit'] * l['qty'] * (1 - l['discount'] / 100.0) for l in lines)
            value = min(value, total)
            lines.append({
                'key': 'rt-points', 'product': self._rt_redeem_product(), 'qty': 1.0, 'price_unit': -value,
                'discount': 0.0, 'cashier_discount': 0.0, 'taxes': self.env['account.tax'], 'note': '',
                'extra': {'points': redeem}, 'vals': {}, 'label': _('%s points', redeem), 'free': False,
            })
        return lines

    def _rt_apply_offers(self, lines):
        offers = self.env['pos.bd.offer']._pos_active(self)
        if not offers:
            return lines
        out = []
        for line in lines:
            product = line['product']
            if line['price_unit'] <= 0 or line.get('refund') or line['qty'] <= 0:
                out.append(line)
                continue
            best = 0.0
            label = ''
            for offer in offers.filtered(lambda o: o.kind == 'percent'):
                if offer._applies_to(product) and offer.percent > best:
                    best, label = offer.percent, offer.name
            if best and best > line['discount']:
                line['discount'] = 100.0 - (100.0 - line['discount']) * (100.0 - best) / 100.0
                line['label'] = ' · '.join(filter(None, [line['label'], label]))
            out.append(line)
            for offer in offers.filtered(lambda o: o.kind == 'bogo'):
                if not offer._applies_to(product):
                    continue
                group = offer.buy_qty + offer.get_qty
                free = math.floor(line['qty'] / group) * offer.get_qty
                if free > 0:
                    line['qty'] -= free
                    out.append(dict(line, key=line['key'] + '-free', qty=free, discount=100.0, cashier_discount=0.0,
                                    label=offer.name, free=True, vals=dict(line['vals'])))
                    break
        bill_offers = offers.filtered(lambda o: o.kind == 'bill').sorted('min_amount', reverse=True)
        if bill_offers:
            total = sum(l['price_unit'] * l['qty'] * (1 - l['discount'] / 100.0) for l in out if not l.get('refund'))
            for offer in bill_offers:
                if total >= offer.min_amount and offer.amount > 0 and total > 0:
                    pct = min(100.0, offer.amount * 100.0 / total)
                    for line in out:
                        if line['price_unit'] > 0 and not line['free'] and not line.get('refund'):
                            line['discount'] = 100.0 - (100.0 - line['discount']) * (100.0 - pct) / 100.0
                    out[0]['label'] = ' · '.join(filter(None, [out[0]['label'], offer.name]))
                    break
        return [l for l in out if l['qty'] > 0 or l.get('refund')]

    def _pos_modern_check_payments(self, payments, quote, partner, payload):
        res = super()._pos_modern_check_payments(payments, quote, partner, payload)
        later = self.payment_method_ids.filtered(lambda pm: pm.type == 'pay_later')
        amount = sum(float(p['amount']) for p in payments if int(p['method_id']) in later.ids)
        if amount > 0:
            if not partner:
                raise UserError(_("Choose the customer to sell on credit (baki)."))
            limit = partner.rt_credit_limit
            if limit <= 0:
                raise UserError(_("%s has no baki limit. Set one on the customer first.", partner.name))
            due = partner._rt_due()
            if float_compare(due + amount, limit, precision_rounding=self.currency_id.rounding) > 0:
                raise UserError(_("Baki limit reached: %(name)s owes %(due)s, limit %(limit)s.", name=partner.name,
                                  due=formatLang(self.env, due, currency_obj=self.currency_id),
                                  limit=formatLang(self.env, limit, currency_obj=self.currency_id)))
        return res

    def _pos_modern_after_order(self, order, payload):
        res = super()._pos_modern_after_order(order, payload)
        partner = order.partner_id
        if self.rt_points and partner:
            Move = self.env['pos.bd.points.move'].sudo()
            redeemed = sum(l.qty for l in order.lines if l.product_id.default_code == 'RT-POINTS')
            extra = payload.get('extra') or {}
            if redeemed and extra.get('redeem_points'):
                Move.create({'partner_id': partner.id, 'points': -float(extra['redeem_points']), 'order_id': order.id,
                             'name': _('Redeemed on %s', order.pos_reference or order.name)})
            paid = sum(l.price_subtotal_incl for l in order.lines if l.product_id.default_code != 'RT-POINTS')
            earned = math.floor(paid / self.rt_points_per) if self.rt_points_per > 0 and paid > 0 else 0
            if earned:
                Move.create({'partner_id': partner.id, 'points': earned, 'order_id': order.id,
                             'name': _('Earned on %s', order.pos_reference or order.name)})
        return res

    def _rt_check_serial(self, product, serial):
        """A serial number cannot be sold twice (unless it came back)."""
        Lot = self.env['pos.pack.operation.lot'].sudo()
        sold = Lot.search([('lot_name', '=', serial), ('product_id', '=', product.id),
                           ('pos_order_line_id.order_id.state', 'in', ('paid', 'done', 'invoiced'))])
        balance = sum(l.pos_order_line_id.qty for l in sold)
        if balance > 0:
            raise UserError(_("IMEI / serial %(sn)s of %(product)s was already sold.", sn=serial,
                              product=product.display_name))

    # ------------------------------------------------------------------ stock count and damage
    def pos_rt_stock_apply(self, mode, lines, note=''):
        """mode 'count': set the counted quantity of the shop's shelf; 'damage': write off."""
        self.ensure_one()
        location = self.picking_type_id.default_location_src_id
        if not location:
            raise UserError(_("This shop has no stock location."))
        Quant = self.env['stock.quant'].sudo().with_context(inventory_mode=True)
        done = 0
        for line in lines or []:
            product = self.env['product.product'].browse(int(line.get('product_id') or 0)).exists()
            qty = float(line.get('qty') or 0)
            if not product or not product.is_storable:
                continue
            if mode == 'count':
                quants = Quant._gather(product, location, strict=True)
                quant = quants[:1] or Quant.create({'product_id': product.id, 'location_id': location.id})
                quant.inventory_quantity = qty - sum((quants - quant).mapped('quantity'))
                quant.action_apply_inventory()
                done += 1
            elif mode == 'damage' and qty > 0:
                scrap = self.env['stock.scrap'].sudo().create({
                    'product_id': product.id, 'scrap_qty': qty, 'product_uom_id': product.uom_id.id,
                    'location_id': location.id, 'company_id': self.company_id.id,
                    'origin': 'POS damage · %s%s' % (self.name, (' · ' + note) if note else ''),
                })
                scrap.do_scrap()
                done += 1
        return done

    # ------------------------------------------------------------------ customer panel / due collection
    def pos_rt_customer_info(self, partner_id):
        self.ensure_one()
        partner = self.env['res.partner'].browse(int(partner_id)).exists()
        if not partner:
            return {}
        orders = self.env['pos.order'].search([('partner_id', '=', partner.id), ('state', 'in', ('paid', 'done', 'invoiced'))],
                                              order='date_order desc', limit=5)
        spent = self.env['pos.order']._read_group([('partner_id', '=', partner.id), ('state', 'in', ('paid', 'done', 'invoiced'))],
                                                  [], ['amount_total:sum', '__count'])
        total, count = spent[0] if spent else (0.0, 0)
        return {
            'id': partner.id,
            'points': partner.rt_points,
            'due': partner._rt_due(),
            'credit_limit': partner.rt_credit_limit,
            'spent': total or 0.0,
            'count': count,
            'orders': [{
                'id': o.id, 'ref': o.pos_reference or o.name,
                'date': format_datetime(self.env, o.date_order, dt_format='dd/MM/yy'),
                'total': o.amount_total,
                'items': ', '.join(o.lines[:3].mapped('product_id.name')) + ('…' if len(o.lines) > 3 else ''),
            } for o in orders],
        }

    def pos_rt_collect_due(self, partner_id, amount, memo=''):
        """Money a customer pays back on their baki, posted as a customer payment."""
        self.ensure_one()
        partner = self.env['res.partner'].browse(int(partner_id)).exists()
        amount = float(amount or 0.0)
        if not partner or amount <= 0:
            raise UserError(_("Choose the customer and type the amount."))
        if not self.rt_due_journal_id:
            raise UserError(_("Choose the journal for dues in the Counter settings."))
        payment = self.env['account.payment'].sudo().create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.commercial_partner_id.id,
            'amount': amount,
            'journal_id': self.rt_due_journal_id.id,
            'memo': memo or _('Baki collected at %s', self.name),
            'company_id': self.company_id.id,
        })
        payment.action_post()
        return {'payment': payment.name, 'due': partner._rt_due(), 'amount': amount}


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _pos_modern_receipt_data(self):
        data = super()._pos_modern_receipt_data()
        partner = self.partner_id
        if partner and self.config_id.rt_points:
            data['extra']['points'] = partner.rt_points
        if partner and any(p.payment_method_id.type == 'pay_later' for p in self.payment_ids):
            data['extra']['due'] = partner._rt_due()
        return data

    def _pos_bd_sms_extra(self):
        """Points balance in the SMS receipt (with pos_bd_payment)."""
        text = super()._pos_bd_sms_extra() if hasattr(super(), '_pos_bd_sms_extra') else ''
        if self.partner_id and self.config_id.rt_points:
            text = ' '.join(filter(None, [text, _('Points: %s', int(self.partner_id.rt_points))]))
        return text
