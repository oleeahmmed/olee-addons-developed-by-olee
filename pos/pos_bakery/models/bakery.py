from collections import defaultdict

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_compare, format_datetime

CAKE_STATES = [('draft', 'New'), ('confirmed', 'Advance paid'), ('ready', 'Ready'), ('delivered', 'Delivered'),
               ('cancel', 'Cancelled')]


def _day_bounds(env, day):
    from odoo.addons.modern_theme.tools import local_midnight
    return local_midnight(day, tz=env.tz), local_midnight(fields.Date.add(day, days=1), tz=env.tz)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    bk_bakery = fields.Boolean(string="Bakery counter", help="Token, morning bake, wastage, cake orders.")
    bk_token = fields.Boolean(string="Queue token on every sale", default=True)
    bk_token_slip = fields.Boolean(string="Print the token on its own slip")
    bk_advance_product_id = fields.Many2one('product.product', string="Cake advance product")

    def _bk_location(self):
        self.ensure_one()
        return self.picking_type_id.default_location_src_id or self.env['stock.warehouse'].search(
            [('company_id', '=', self.company_id.id)], limit=1).lot_stock_id

    def _bk_advance_product(self):
        self.ensure_one()
        product = self.bk_advance_product_id or self.env['product.product'].sudo().search(
            [('default_code', '=', 'BK-ADVANCE')], limit=1)
        if not product:
            product = self.env['product.product'].sudo().create({
                'name': _('Cake advance'), 'type': 'service', 'default_code': 'BK-ADVANCE', 'list_price': 0.0,
                'sale_ok': True, 'available_in_pos': False, 'taxes_id': [(5, 0, 0)],
            })
        if not self.bk_advance_product_id:
            self.sudo().bk_advance_product_id = product
        return product

    # ------------------------------------------------------------------ counter hooks
    def _pos_modern_features(self):
        features = super()._pos_modern_features()
        features.update({
            'bakery': self.bk_bakery,
            'token_slip': self.bk_bakery and self.bk_token and self.bk_token_slip,
        })
        return features

    def _pos_modern_adjust_lines(self, lines, payload, partner):
        lines = super()._pos_modern_adjust_lines(lines, payload, partner)
        if not self.bk_bakery:
            return lines
        Cake = self.env['pos.bk.cake']
        out = []
        for line in lines:
            extra = line['extra'] or {}
            cake = Cake.browse(int(extra.get('bk_cake_id') or 0)).exists()
            role = extra.get('bk_role')
            if cake and role == 'cake':
                # the cake at its agreed price (taxes included)
                unit = cake.price_total / (line['qty'] or 1.0)
                taxes = line['taxes']
                factor = taxes.compute_all(1.0, self.currency_id, 1.0, product=line['product'])['total_included'] if taxes else 1.0
                line['price_unit'] = unit / factor if factor else unit
                line['discount'] = 0.0
                line['label'] = _('%(name)s · %(flavour)s %(weight)s', name=cake.name, flavour=cake.flavour or '',
                                  weight=cake.weight or '')
                out.append(line)
                if cake.advance > 0:
                    out.append(self._bk_advance_line(cake, -cake.advance, _('Advance paid on %s', cake.name)))
            elif cake and role == 'advance':
                # the cart shows the cake; the order books the advance only
                line['product'] = self._bk_advance_product()
                line['taxes'] = self.env['account.tax']
                line['qty'] = 1.0
                line['price_unit'] = cake.advance
                line['discount'] = 0.0
                line['label'] = _('Advance for %s', cake.name)
                out.append(line)
            else:
                out.append(line)
        return out

    def _bk_advance_line(self, cake, amount, label):
        product = self._bk_advance_product()
        return {
            'key': 'bk-adv-%s' % cake.id, 'product': product, 'qty': 1.0, 'price_unit': amount, 'discount': 0.0,
            'cashier_discount': 0.0, 'taxes': self.env['account.tax'], 'note': '', 'extra': {}, 'vals': {},
            'label': label, 'free': False, 'refund': False,
        }

    def _pos_modern_order_vals(self, vals, payload, quote, partner):
        vals = super()._pos_modern_order_vals(vals, payload, quote, partner)
        if self.bk_bakery and self.bk_token:
            start, end = _day_bounds(self.env, fields.Date.context_today(self))
            last = self.env['pos.order'].search([('config_id', '=', self.id), ('bk_token', '>', 0),
                                                 ('date_order', '>=', start), ('date_order', '<', end)],
                                                order='bk_token desc', limit=1)
            vals['bk_token'] = (last.bk_token or 0) + 1
        return vals

    def _pos_modern_after_order(self, order, payload):
        res = super()._pos_modern_after_order(order, payload)
        for line in payload.get('lines') or []:
            extra = line.get('extra') or {}
            cake = self.env['pos.bk.cake'].browse(int(extra.get('bk_cake_id') or 0)).exists()
            if not cake:
                continue
            if extra.get('bk_role') == 'advance':
                cake.write({'state': 'confirmed', 'advance_order_id': order.id})
            elif extra.get('bk_role') == 'cake':
                cake.write({'state': 'delivered', 'final_order_id': order.id})
        return res

    # ------------------------------------------------------------------ cake orders
    def pos_bk_cake_save(self, vals):
        """Create a cake order from the counter (state New until its advance is paid)."""
        self.ensure_one()
        product = self.env['product.product'].browse(int(vals.get('product_id') or 0)).exists()
        if not product:
            raise UserError(_("Choose the cake."))
        price = float(vals.get('price_total') or 0.0)
        advance = float(vals.get('advance') or 0.0)
        if price <= 0:
            raise UserError(_("Type the cake's price."))
        if float_compare(advance, price, precision_digits=2) > 0:
            raise UserError(_("The advance is more than the price."))
        if not vals.get('delivery_at'):
            raise UserError(_("Choose the delivery date and time."))
        cake = self.env['pos.bk.cake'].create({
            'config_id': self.id,
            'product_id': product.id,
            'partner_id': int(vals['partner_id']) if vals.get('partner_id') else False,
            'customer_name': vals.get('customer_name') or False,
            'phone': vals.get('phone') or False,
            'delivery_at': fields.Datetime.to_datetime(str(vals['delivery_at']).replace('T', ' ')[:16] + ':00')
            if vals.get('delivery_at') else False,
            'flavour': vals.get('flavour') or False,
            'weight': vals.get('weight') or False,
            'message': vals.get('message') or False,
            'note': vals.get('note') or False,
            'price_total': price,
            'advance': advance,
        })
        return cake._bk_row()

    def pos_bk_cakes(self, scope='open'):
        self.ensure_one()
        domain = [('config_id', '=', self.id)]
        if scope == 'open':
            domain.append(('state', 'in', ('draft', 'confirmed', 'ready')))
        return [c._bk_row() for c in self.env['pos.bk.cake'].search(domain, order='delivery_at, id', limit=200)]

    # ------------------------------------------------------------------ production and wastage
    def pos_bk_bake(self, lines, note=''):
        """Morning bake: [{'product_id', 'qty'}]. Made with the recipe when there is one."""
        self.ensure_one()
        lines = [l for l in lines or [] if float(l.get('qty') or 0) > 0]
        if not lines:
            raise UserError(_("Type what was baked."))
        batch = self.env['pos.bk.batch'].create({
            'config_id': self.id,
            'note': note or False,
            'line_ids': [(0, 0, {'product_id': int(l['product_id']), 'qty': float(l['qty'])}) for l in lines],
        })
        batch.action_done()
        return batch._bk_row()

    def pos_bk_waste(self, lines, reason=''):
        """Unsold / spoiled items written off: [{'product_id', 'qty'}]."""
        self.ensure_one()
        location = self._bk_location()
        Scrap = self.env['stock.scrap'].sudo()
        count = 0
        for line in lines or []:
            qty = float(line.get('qty') or 0)
            product = self.env['product.product'].browse(int(line.get('product_id') or 0)).exists()
            if qty <= 0 or not product:
                continue
            scrap = Scrap.create({
                'product_id': product.id,
                'scrap_qty': qty,
                'product_uom_id': product.uom_id.id,
                'location_id': location.id,
                # not translated: the day report finds the wastage by this text
                'origin': 'POS wastage · %s%s' % (self.name, (' · ' + reason) if reason else ''),
                'company_id': self.company_id.id,
            })
            scrap.do_scrap()
            count += 1
        return count

    def pos_bk_day_report(self, day=False):
        """Per product: baked, sold, wasted, left, for one day."""
        self.ensure_one()
        day = fields.Date.to_date(day) if day else fields.Date.context_today(self)
        start, end = _day_bounds(self.env, day)
        rows = defaultdict(lambda: {'baked': 0.0, 'sold': 0.0, 'wasted': 0.0})
        for line in self.env['pos.bk.batch.line'].search([('batch_id.config_id', '=', self.id),
                                                          ('batch_id.date', '>=', start), ('batch_id.date', '<', end)]):
            rows[line.product_id]['baked'] += line.qty
        for line in self.env['pos.order.line'].search([('order_id.config_id', '=', self.id),
                                                       ('order_id.state', 'in', ('paid', 'done', 'invoiced')),
                                                       ('order_id.date_order', '>=', start),
                                                       ('order_id.date_order', '<', end)]):
            if line.product_id.type != 'service':
                rows[line.product_id]['sold'] += line.qty
        for scrap in self.env['stock.scrap'].sudo().search([('origin', 'ilike', 'POS wastage · %s' % self.name),
                                                            ('date_done', '>=', start), ('date_done', '<', end)]):
            rows[scrap.product_id]['wasted'] += scrap.scrap_qty
        location = self._bk_location()
        out = []
        for product, r in rows.items():
            out.append({
                'id': product.id,
                'name': product.display_name,
                'baked': r['baked'],
                'sold': r['sold'],
                'wasted': r['wasted'],
                'left': product.with_context(location=location.id).qty_available if product.is_storable else None,
            })
        out.sort(key=lambda r: -(r['baked'] + r['sold']))
        return {'day': fields.Date.to_string(day), 'shop': self.name, 'rows': out,
                'totals': {k: sum(r[k] for r in out) for k in ('baked', 'sold', 'wasted')}}


class PosOrder(models.Model):
    _inherit = 'pos.order'

    bk_token = fields.Integer(string="Token", copy=False, index=True)

    def _pos_modern_receipt_data(self):
        data = super()._pos_modern_receipt_data()
        if self.bk_token:
            data['extra']['token'] = self.bk_token
        return data


class PosBkBatch(models.Model):
    _name = 'pos.bk.batch'
    _description = 'Bakery production batch'
    _order = 'date desc, id desc'

    name = fields.Char(default=lambda self: _('Bake %s', fields.Date.context_today(self)))
    config_id = fields.Many2one('pos.config', required=True, index=True, ondelete='cascade')
    company_id = fields.Many2one(related='config_id.company_id', store=True)
    date = fields.Datetime(default=fields.Datetime.now, required=True)
    user_id = fields.Many2one('res.users', default=lambda self: self.env.user)
    state = fields.Selection([('draft', 'Draft'), ('done', 'Done')], default='draft')
    note = fields.Char()
    line_ids = fields.One2many('pos.bk.batch.line', 'batch_id', string='Baked')

    def action_done(self):
        for batch in self.filtered(lambda b: b.state == 'draft'):
            location = batch.config_id._bk_location()
            for line in batch.line_ids:
                line._bk_produce(location)
            batch.state = 'done'
        return True

    def _bk_row(self):
        self.ensure_one()
        return {'id': self.id, 'name': self.name, 'lines': [{'name': l.product_id.display_name, 'qty': l.qty,
                                                            'mo': l.production_id.name or ''} for l in self.line_ids]}


class PosBkBatchLine(models.Model):
    _name = 'pos.bk.batch.line'
    _description = 'Bakery production line'

    batch_id = fields.Many2one('pos.bk.batch', required=True, ondelete='cascade', index=True)
    product_id = fields.Many2one('product.product', required=True)
    qty = fields.Float(required=True)
    production_id = fields.Many2one('mrp.production', string='Manufacturing order', readonly=True)

    def _bk_produce(self, location):
        """With a recipe (normal BoM): a manufacturing order, done; else the stock is added."""
        self.ensure_one()
        product = self.product_id.sudo()
        company = self.batch_id.config_id.company_id
        bom = self.env['mrp.bom'].sudo()._bom_find(product, company_id=company.id, bom_type='normal').get(product)
        if bom:
            production = self.env['mrp.production'].sudo().create({
                'product_id': product.id,
                'product_qty': self.qty,
                'product_uom_id': product.uom_id.id,
                'bom_id': bom.id,
                'company_id': company.id,
                'origin': self.batch_id.name,
                'location_dest_id': location.id,
            })
            production.action_confirm()
            production.qty_producing = self.qty
            production._set_qty_producing()
            for move in production.move_raw_ids:
                move.quantity = move.product_uom_qty
                move.picked = True
            production.with_context(skip_consumption=True, skip_backorder=True).button_mark_done()
            self.production_id = production
        elif product.is_storable:
            quant = self.env['stock.quant'].sudo().with_context(inventory_mode=True)
            current = quant._gather(product, location, strict=True).filtered(lambda q: not q.lot_id)
            record = current[:1] or quant.create({'product_id': product.id, 'location_id': location.id})
            record.inventory_quantity = record.quantity + self.qty
            record.action_apply_inventory()


class PosBkCake(models.Model):
    _name = 'pos.bk.cake'
    _description = 'Cake order'
    _order = 'delivery_at, id'

    name = fields.Char(default='/', copy=False)
    config_id = fields.Many2one('pos.config', required=True, index=True, ondelete='cascade')
    company_id = fields.Many2one(related='config_id.company_id', store=True)
    product_id = fields.Many2one('product.product', string='Cake', required=True)
    partner_id = fields.Many2one('res.partner', string='Customer')
    customer_name = fields.Char()
    phone = fields.Char()
    delivery_at = fields.Datetime(string='Delivery', required=True, index=True)
    flavour = fields.Char()
    weight = fields.Char(help="1 pound, 2 kg…")
    message = fields.Char(string='Message on the cake')
    note = fields.Text()
    price_total = fields.Float(string='Price', required=True)
    advance = fields.Float()
    due = fields.Float(compute='_compute_due')
    state = fields.Selection(CAKE_STATES, default='draft', required=True, index=True)
    advance_order_id = fields.Many2one('pos.order', readonly=True)
    final_order_id = fields.Many2one('pos.order', readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', '/') == '/':
                vals['name'] = self.env['ir.sequence'].next_by_code('pos_bakery.cake') or '/'
        return super().create(vals_list)

    @api.depends('price_total', 'advance')
    def _compute_due(self):
        for cake in self:
            cake.due = cake.price_total - cake.advance

    def pos_bk_set_state(self, state):
        self.write({'state': state})
        return [c._bk_row() for c in self]

    def _bk_row(self):
        self.ensure_one()
        return {
            'id': self.id,
            'name': self.name,
            'product_id': self.product_id.id,
            'product': self.product_id.display_name,
            'customer': self.partner_id.name or self.customer_name or '',
            'phone': self.phone or self.partner_id.phone or '',
            'partner': [self.partner_id.id, self.partner_id.name] if self.partner_id else False,
            'delivery': format_datetime(self.env, self.delivery_at, dt_format='dd/MM HH:mm') if self.delivery_at else '',
            'flavour': self.flavour or '',
            'weight': self.weight or '',
            'message': self.message or '',
            'price': self.price_total,
            'advance': self.advance,
            'due': self.due,
            'state': self.state,
            'state_label': dict(CAKE_STATES).get(self.state),
        }
