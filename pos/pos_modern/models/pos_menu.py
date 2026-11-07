"""Modern POS: the counter (Menu page) and the Tables page.

Everything goes through Odoo's own Point of Sale: the products, prices (pricelist),
taxes and fiscal position of the shop, its open session, its payment methods, and the
order itself is saved with pos.order.sync_from_ui — the same call Odoo's register uses —
so stock, accounting, the session's closing and the reports all count it.

The counter is the shared core of every shop type. Shop addons (pos_bd_payment,
l10n_bd_pos, pos_pharmacy, pos_restaurant_bd, pos_retail_bd …) plug in through the
``_pos_modern_*`` hooks below instead of copying this file:

    _pos_modern_features()              flags + settings sent to the counter screen
    _pos_modern_extend_rows()           extra keys on product cards (stock, generic name…)
    _pos_modern_adjust_lines()          change cart lines before pricing (offers, lots…)
    _pos_modern_allowed_methods()       payment methods offered at the counter
    _pos_modern_check_payments()        validate tenders (TrxID, credit limit…)
    _pos_modern_payment_vals()          extra values of each pos.payment
    _pos_modern_order_vals()            extra values of the pos.order
    _pos_modern_after_order()           after the order is saved (SMS, points, kitchen…)
"""
import hmac
import logging
import re
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError
from odoo.tools import float_compare, float_is_zero, float_round
from odoo.tools import format_datetime
from odoo.tools.misc import formatLang

_logger = logging.getLogger(__name__)

CLOSED = ('closing_control', 'closed')


def _num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value, low=0.0, high=100.0):
    return max(low, min(high, _num(value)))


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # ------------------------------------------------------------------
    # Counter settings (shown in the "Counter settings" page of the shop)
    # ------------------------------------------------------------------
    pm_receipt_width = fields.Selection(
        [('58', '58 mm'), ('80', '80 mm'), ('a4', 'A4 / Letter')], string="Receipt paper",
        default='80', help="Width of the thermal receipt printed from the counter.")
    pm_auto_print = fields.Boolean(string="Print the receipt after payment", default=True)
    pm_show_stock = fields.Boolean(string="Show stock on product cards", default=True)
    pm_low_stock = fields.Float(string="Low stock under", default=5.0,
                                help="Product cards turn amber when the stock is at or under this quantity.")
    pm_block_no_stock = fields.Boolean(string="Block selling without stock",
                                       help="Storable products with no stock left cannot be added to the cart.")
    pm_discount_limit = fields.Float(
        string="Cashier discount limit (%)", default=10.0,
        help="Line or bill discounts above this need a manager (Point of Sale administrator) "
             "or the manager PIN. 100 = no limit.")
    pm_manager_pin = fields.Char(string="Manager PIN", groups='point_of_sale.group_pos_manager', copy=False,
                                 help="Digits typed by a manager at the counter to approve a big discount.")
    pm_quick_cash = fields.Char(string="Quick cash notes", default="100,500,1000",
                                help="Bank notes shown as one-tap buttons on the payment panel, comma separated.")
    pm_label_size = fields.Selection(
        [('38x25', '38 × 25 mm'), ('50x30', '50 × 30 mm'), ('58x40', '58 × 40 mm (hand tag)')],
        string="Barcode labels", default='50x30', help="Size of the barcode labels / hand tags printed from the counter.")
    pm_product_limit = fields.Integer(string="Products loaded on the counter", default=1000,
                                      help="More products are still found by the search box (from the server).")

    # ------------------------------------------------------------------
    # Hooks for the shop addons
    # ------------------------------------------------------------------
    def _pos_modern_features(self):
        """Flags and settings sent to the counter. Shop addons add their own keys."""
        self.ensure_one()
        return {
            'receipt_width': self.pm_receipt_width or '80',
            'auto_print': self.pm_auto_print,
            'show_stock': self.pm_show_stock,
            'low_stock': self.pm_low_stock,
            'block_no_stock': self.pm_block_no_stock,
            'discount_limit': self.pm_discount_limit,
            'has_pin': bool(self.sudo().pm_manager_pin),
            'is_manager': self.env.user.has_group('point_of_sale.group_pos_manager'),
            'quick_cash': [n for n in (_num(x.strip(), 0) for x in (self.pm_quick_cash or '').split(',')) if n > 0][:6],
            'label_size': self.pm_label_size or '50x30',
            'modifiers': self.env['pos.modern.modifier']._pos_modern_rows(self),
            'cash_rounding': bool(self.cash_rounding and self.rounding_method),
            'rounding': self.rounding_method.rounding if self.cash_rounding and self.rounding_method else 0.0,
        }

    def _pos_modern_extend_rows(self, products, rows):
        """Add keys to the product rows of the counter (rows[i] is products[i])."""
        self.ensure_one()
        if not self.pm_show_stock and not self.pm_block_no_stock:
            return rows
        location = self.picking_type_id.default_location_src_id
        storable = products.filtered('is_storable')
        if not storable:
            return rows
        ctx_products = storable.with_context(location=location.id) if location else storable
        stock = {p.id: p.qty_available for p in ctx_products}
        for product, row in zip(products, rows):
            if product.id in stock:
                row['stock'] = stock[product.id]
                row['uom'] = product.uom_id.name
        return rows

    def _pos_modern_adjust_lines(self, lines, payload, partner):
        """Change the priced cart lines (list of dicts, see _pos_modern_prepare_lines).

        Shop addons add free items (offers), split lines by lot (pharmacy), add a
        service charge (restaurant)… Return the new list.
        """
        return lines

    def _pos_modern_allowed_methods(self, partner=False):
        """Payment methods of the counter. Customer account (pay later) needs pos_retail_bd."""
        self.ensure_one()
        return self.payment_method_ids.filtered(lambda pm: pm.type != 'pay_later')

    def _pos_modern_method_row(self, method):
        return {
            'id': method.id,
            'name': method.name,
            'is_cash': method.is_cash_count,
            'type': method.type,
            'needs_ref': False,
            'kind': 'cash' if method.is_cash_count else ('later' if method.type == 'pay_later' else 'card'),
        }

    def _pos_modern_check_payments(self, payments, quote, partner, payload):
        """Raise UserError when a tender is not acceptable (shop addons add rules)."""
        return True

    def _pos_modern_payment_vals(self, method, payment, payload):
        vals = {}
        ref = (payment.get('ref') or '').strip()
        if ref:
            vals['transaction_id'] = ref[:64]
        return vals

    def _pos_modern_order_vals(self, vals, payload, quote, partner):
        return vals

    def _pos_modern_after_order(self, order, payload):
        return True

    # ------------------------------------------------------------------
    # Menu page data
    # ------------------------------------------------------------------
    @api.model
    def pos_modern_menu(self, config_id=False):
        configs = self.search([('company_id', 'in', self.env.companies.ids)], order='name')
        config = configs.filtered(lambda c: c.id == config_id)[:1] or configs.filtered('current_session_id')[:1] or configs[:1]
        shops = [{
            'id': c.id,
            'name': c.name,
            'state': c.current_session_id.state if c.current_session_id else 'closed',
        } for c in configs]
        if not config:
            return {'shops': [], 'config_id': False}
        session = config.current_session_id
        currency = config.currency_id
        company = config.company_id
        return {
            'shops': shops,
            'config_id': config.id,
            'config_name': config.name,
            'session': {
                'id': session.id,
                'name': session.name,
                'state': session.state,
                'user': session.user_id.name,
                'start_at': fields.Datetime.to_string(session.start_at) if session.start_at else False,
            } if session else False,
            'cash_control': config.cash_control,
            'currency_id': currency.id,
            'currency_name': currency.name,
            'currency_symbol': currency.symbol,
            'currency_digits': currency.decimal_places,
            'tax_included': config.iface_tax_included == 'total',
            'company': config._pos_modern_company_info(),
            'user': self.env.user.name,
            'categories': config._pos_modern_categories(),
            'products': config._pos_modern_products(),
            'payment_methods': [config._pos_modern_method_row(pm) for pm in config._pos_modern_allowed_methods()],
            'restaurant': config._pos_modern_is_restaurant(),
            'held_count': self.env['pos.modern.hold'].search_count([('config_id', '=', config.id)]),
            'features': config._pos_modern_features(),
            'receipt_header': config.receipt_header or '',
            'receipt_footer': config.receipt_footer or '',
            'company_name': company.name,
        }

    def _pos_modern_company_info(self):
        self.ensure_one()
        company = self.company_id
        partner = company.partner_id
        address = ', '.join(p for p in [partner.street, partner.street2, partner.city, partner.zip] if p)
        return {
            'name': company.name,
            'address': address,
            'phone': company.phone or partner.phone or '',
            'email': company.email or '',
            'vat': company.vat or '',
            'website': company.website or '',
            'logo': bool(company.logo),
            'id': company.id,
        }

    def _pos_modern_is_restaurant(self):
        self.ensure_one()
        return 'restaurant.table' in self.env and bool(self._fields.get('module_pos_restaurant')) \
            and bool(self.module_pos_restaurant)

    def _pos_modern_categories(self):
        self.ensure_one()
        Category = self.env['pos.category']
        if self.limit_categories and self.iface_available_categ_ids:
            categories = self.iface_available_categ_ids
        else:
            categories = Category.search([])
        return [{
            'id': c.id,
            'name': c.name,
            'color': c.color or 0,
            'image': bool(c.image_128),
        } for c in categories.sorted(lambda c: (c.sequence, c.name)) if not c.parent_id or c.parent_id in categories]

    def _pos_modern_domain(self):
        self.ensure_one()
        domain = [('available_in_pos', '=', True), ('sale_ok', '=', True),
                  ('company_id', 'in', [self.company_id.id, False])]
        if self.limit_categories and self.iface_available_categ_ids:
            domain.append(('pos_categ_ids', 'in', self.iface_available_categ_ids.ids))
        return domain

    def _pos_modern_unit_prices(self, product, qty=1.0, fpos=None, partner=None):
        """(price_unit as stored on the line, total excluded, total included) for one unit."""
        self.ensure_one()
        pricelist = self.pricelist_id
        currency = self.currency_id
        Tax = self.env['account.tax']
        price = pricelist._get_product_price(product, qty or 1.0, currency=currency) if pricelist else product.lst_price
        taxes = product.taxes_id.filtered_domain(Tax._check_company_domain(self.company_id))
        fpos = self.default_fiscal_position_id if fpos is None else fpos
        mapped = fpos.map_tax(taxes) if fpos else taxes
        price = Tax._fix_tax_included_price_company(price, taxes, mapped, self.company_id)
        amounts = mapped.compute_all(price, currency, 1.0, product=product, partner=partner or None) if mapped else {
            'total_excluded': price, 'total_included': price}
        return price, amounts['total_excluded'], amounts['total_included'], mapped

    def _pos_modern_product_rows(self, products):
        self.ensure_one()
        rows = []
        units = {self.env.ref(x, raise_if_not_found=False) for x in
                 ('uom.product_uom_unit', 'uom.product_uom_dozen', 'uom.product_uom_pack_6')}
        modifier_map = self.env['pos.modern.modifier']._pos_modern_map(self, products)
        for product in products:
            __, excl, incl, mapped = self._pos_modern_unit_prices(product)
            attrs = [[v.attribute_id.name, v.name, v.attribute_id.id, v.id,
                      v.product_attribute_value_id.sequence, v.product_attribute_value_id.id] for v in
                     product.product_template_attribute_value_ids.sorted(
                         lambda v: (v.attribute_id.sequence, v.attribute_id.id, v.product_attribute_value_id.sequence, v.id))]
            rows.append({
                'id': product.id,
                'tmpl_id': product.product_tmpl_id.id,
                'name': product.with_context(display_default_code=False).display_name,
                'excl': excl,
                'incl': incl,
                'tax_ids': mapped.ids,
                'categ_ids': product.pos_categ_ids.ids,
                'image': bool(product.image_128),
                'barcode': product.barcode or '',
                'code': product.default_code or '',
                'storable': bool(product.is_storable),
                'tracking': product.tracking if product.is_storable else 'none',
                'uom': product.uom_id.name,
                'attrs': attrs,
                'attrs_text': ' / '.join(a[1] for a in attrs),
                'variants': product.product_tmpl_id.product_variant_count,
                # weighed / measured items (kg, metre, yard…): the counter asks the quantity
                'ask_qty': bool(product.to_weight or product.uom_id not in units),
                'modifiers': modifier_map.get(product.id, []),
            })
        return self._pos_modern_extend_rows(products, rows)

    def _pos_modern_products(self, limit=None):
        self.ensure_one()
        limit = limit or self.pm_product_limit or 1000
        products = self.env['product.product'].search(self._pos_modern_domain(), order='name', limit=limit)
        return self._pos_modern_product_rows(products)

    def pos_modern_search_products(self, query, limit=40):
        """Search box fallback: products not loaded on the counter (name, code, barcode)."""
        self.ensure_one()
        query = (query or '').strip()
        if not query:
            return []
        domain = self._pos_modern_domain() + ['|', '|', ('name', 'ilike', query), ('default_code', 'ilike', query),
                                              ('barcode', '=', query)]
        domain = self._pos_modern_search_domain(domain, query)
        products = self.env['product.product'].search(domain, limit=limit)
        return self._pos_modern_product_rows(products)

    def _pos_modern_search_domain(self, domain, query):
        return domain

    # ------------------------------------------------------------------
    # Return / exchange: find the earlier bill
    # ------------------------------------------------------------------
    def pos_modern_find_order(self, reference):
        """An earlier paid bill by its receipt number (scan the receipt), for a return or an exchange."""
        self.ensure_one()
        reference = (reference or '').strip()
        if not reference:
            return False
        Order = self.env['pos.order']
        domain = [('company_id', '=', self.company_id.id), ('state', 'in', ('paid', 'done', 'invoiced'))]
        order = Order.search(domain + ['|', '|', '|', ('pos_reference', '=', reference), ('uuid', '=', reference),
                                       ('name', '=', reference), ('tracking_number', '=', reference)],
                             order='id desc', limit=1)
        if not order:
            order = Order.search(domain + [('pos_reference', 'ilike', reference)], order='id desc', limit=1)
        if not order:
            return False
        lines = order.lines.filtered(lambda l: l.qty > 0 and l.qty - l.refunded_qty > 0)
        incl = self.iface_tax_included == 'total'
        return {
            'id': order.id,
            'ref': order.pos_reference or order.name,
            'date': format_datetime(self.env, order.date_order, dt_format='dd/MM/yyyy HH:mm'),
            'shop': order.config_id.name,
            'partner': self._pos_modern_customer_row(order.partner_id) if order.partner_id else False,
            'total': order.amount_total,
            'lines': [{
                'id': l.id,
                'product_id': l.product_id.id,
                'name': l.full_product_name or l.product_id.display_name,
                'qty': l.qty,
                'left': l.qty - l.refunded_qty,
                'price': (l.price_subtotal_incl if incl else l.price_subtotal) / (l.qty or 1),
                'lots': l.pack_lot_ids.mapped('lot_name'),
            } for l in lines],
            'products': self._pos_modern_product_rows(lines.product_id),
        }

    # ------------------------------------------------------------------
    # Barcode labels
    # ------------------------------------------------------------------
    def pos_modern_label_rows(self, product_ids):
        """What the labels print, per product (shop addons add size, colour, care text…)."""
        self.ensure_one()
        products = self.env['product.product'].browse([int(i) for i in product_ids or []]).exists()
        rows = self._pos_modern_product_rows(products)
        incl = self.iface_tax_included == 'total'
        return [{
            'id': r['id'],
            'name': r['name'],
            'code': r['code'],
            'barcode': r['barcode'],
            'price': r['incl'] if incl else r['excl'],
            'attrs': r.get('attrs_text', ''),
            'extra': r.get('label_extra', ''),
        } for r in rows]

    def pos_modern_generate_barcodes(self, product_ids):
        """EAN-13 in-store barcodes (prefix 200) for products that have none."""
        self.ensure_one()
        done = []
        for product in self.env['product.product'].browse([int(i) for i in product_ids or []]).exists():
            if product.barcode:
                continue
            body = '200' + str(product.id).zfill(9)[-9:]
            check = (10 - sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body)) % 10) % 10
            product.sudo().barcode = body + str(check)
            done.append(product.id)
        return self._pos_modern_product_rows(self.env['product.product'].browse(done))

    # ------------------------------------------------------------------
    # Session
    # ------------------------------------------------------------------
    def pos_modern_open_session(self, opening_cash=0.0, notes=''):
        """Open the shop's session (as Odoo's register does: opening control, then opened)."""
        self.ensure_one()
        session = self.current_session_id
        if not session:
            self.open_ui()
            session = self.current_session_id
        if session.state == 'opening_control':
            session.set_opening_control(float(opening_cash or 0.0), notes or '')
        return {'id': session.id, 'name': session.name, 'state': session.state}

    # ------------------------------------------------------------------
    # Manager PIN
    # ------------------------------------------------------------------
    def _pos_modern_pin_ok(self, pin):
        self.ensure_one()
        stored = self.sudo().pm_manager_pin or ''
        return bool(stored) and bool(pin) and hmac.compare_digest(str(stored), str(pin))

    def pos_modern_check_pin(self, pin):
        self.ensure_one()
        return self._pos_modern_pin_ok(pin)

    # ------------------------------------------------------------------
    # Pricing (one place for the quote shown in the cart and the saved order)
    # ------------------------------------------------------------------
    def _pos_modern_partner(self, partner_id):
        return self.env['res.partner'].browse(int(partner_id)).exists() if partner_id else self.env['res.partner']

    def _pos_modern_prepare_lines(self, payload, partner, fpos):
        """Cart lines -> priced lines.

        Each input line: {'product_id', 'qty', 'discount'?, 'note'?, 'key'?, 'extra'?}.
        Each output line is a dict with the product record, qty, price_unit (as stored on the
        pos.order.line), discount, mapped taxes and the computed amounts.
        """
        self.ensure_one()
        currency = self.currency_id
        bill_discount = _clamp(payload.get('bill_discount'))
        raw = [line for line in (payload.get('lines') or []) if _num(line.get('qty'))
               and (_num(line.get('qty')) > 0 or (line.get('extra') or {}).get('refund_line_id'))]
        products = self.env['product.product'].browse([int(line['product_id']) for line in raw]).exists()
        by_id = {p.id: p for p in products}
        Modifier = self.env['pos.modern.modifier']
        lines = []
        refunding = {}  # original line id -> qty taken back in this cart
        for line in raw:
            product = by_id.get(int(line['product_id']))
            extra = line.get('extra') or {}
            qty = _num(line.get('qty'))
            if qty < 0:
                lines.append(self._pos_modern_refund_line(line, product, qty, refunding))
                continue
            if not product or not product.available_in_pos or not product.sale_ok:
                raise UserError(_("A product of the cart cannot be sold in the Point of Sale any more."))
            price, __, __, mapped = self._pos_modern_unit_prices(product, qty, fpos=fpos, partner=partner)
            modifiers = Modifier.browse([int(m) for m in extra.get('modifiers') or []]).exists()
            label = ''
            note = (line.get('note') or '')[:500]
            if modifiers:
                price += sum(modifiers.mapped('price_extra'))
                label = ', '.join(modifiers.mapped('name'))
                note = ' · '.join(filter(None, [label, note]))
            discount = _clamp(line.get('discount'))
            if bill_discount:
                discount = 100.0 - (100.0 - discount) * (100.0 - bill_discount) / 100.0
            lines.append({
                'key': line.get('key') or str(product.id),
                'product': product,
                'qty': qty,
                'price_unit': price,
                'discount': discount,
                'cashier_discount': max(_clamp(line.get('discount')), bill_discount),
                'taxes': mapped,
                'note': note,
                'extra': extra,
                'vals': {},  # extra pos.order.line values (shop addons)
                'label': label,  # extra text under the line (offer name, lot, modifiers…)
                'free': False,
                'refund': False,
            })
        lines = self._pos_modern_adjust_lines(lines, payload, partner)
        for line in lines:
            price = line['price_unit'] * (1 - (line['discount'] or 0.0) / 100.0)
            taxes = line['taxes']
            if taxes:
                amounts = taxes.compute_all(price, currency, line['qty'], product=line['product'], partner=partner or None)
                gross = taxes.compute_all(line['price_unit'], currency, line['qty'], product=line['product'],
                                          partner=partner or None)['total_included']
            else:
                total = currency.round(price * line['qty'])
                amounts = {'total_excluded': total, 'total_included': total, 'taxes': []}
                gross = currency.round(line['price_unit'] * line['qty'])
            line['subtotal'] = amounts['total_excluded']
            line['subtotal_incl'] = amounts['total_included']
            line['gross_incl'] = gross
            line['tax_details'] = amounts.get('taxes', [])
        return lines

    def _pos_modern_refund_line(self, line, product, qty, refunding):
        """A line taken back from an earlier order (return / exchange): its price, discount
        and taxes are the original ones; no more than what is left to return."""
        origin = self.env['pos.order.line'].browse(int((line.get('extra') or {}).get('refund_line_id') or 0)).exists()
        if not origin or origin.order_id.company_id != self.company_id or origin.order_id.state not in (
                'paid', 'done', 'invoiced') or origin.product_id != product:
            raise UserError(_("This item cannot be returned: the original sale was not found."))
        taken = refunding.get(origin.id, 0.0) + abs(qty)
        left = origin.qty - origin.refunded_qty
        if float_compare(taken, left, precision_digits=4) > 0:
            raise UserError(_("Only %(qty)s of %(product)s can still be returned from %(order)s.",
                              qty=round(left, 3), product=product.display_name,
                              order=origin.order_id.pos_reference or origin.order_id.name))
        refunding[origin.id] = taken
        vals = {'refunded_orderline_id': origin.id}
        if origin.pack_lot_ids:
            vals['pack_lot_ids'] = [(0, 0, {'lot_name': name}) for name in origin.pack_lot_ids.mapped('lot_name')][:1]
        return {
            'key': line.get('key') or 'r%s' % origin.id,
            'product': product,
            'qty': qty,
            'price_unit': origin.price_unit,
            'discount': origin.discount,
            'cashier_discount': 0.0,
            'taxes': origin.tax_ids,
            'note': '',
            'extra': line.get('extra') or {},
            'vals': vals,
            'label': _('Return from %s', origin.order_id.pos_reference or origin.order_id.name),
            'free': False,
            'refund': True,
        }

    def _pos_modern_quote(self, payload):
        """Totals of a cart: what the counter shows and what the order will be saved with."""
        self.ensure_one()
        partner = self._pos_modern_partner(payload.get('partner_id'))
        fpos = (partner.property_account_position_id if partner else False) or self.default_fiscal_position_id
        lines = self._pos_modern_prepare_lines(payload, partner, fpos)
        currency = self.currency_id
        total = currency.round(sum(l['subtotal_incl'] for l in lines))
        untaxed = currency.round(sum(l['subtotal'] for l in lines))
        gross = currency.round(sum(l['gross_incl'] for l in lines))
        taxes = {}
        for line in lines:
            for tax in line['tax_details']:
                entry = taxes.setdefault(tax['id'], {'id': tax['id'], 'name': tax['name'], 'amount': 0.0, 'base': 0.0})
                entry['amount'] += tax['amount']
                entry['base'] += tax.get('base', 0.0)
        payable = total
        if self.cash_rounding and self.rounding_method:
            payable = float_round(total, precision_rounding=self.rounding_method.rounding,
                                  rounding_method=self.rounding_method.rounding_method)
        limit = self.pm_discount_limit if self.pm_discount_limit is not False else 100.0
        max_discount = max([l['cashier_discount'] for l in lines] or [0.0])
        needs_pin = float_compare(max_discount, limit, precision_digits=2) > 0 and limit < 100 \
            and not self.env.user.has_group('point_of_sale.group_pos_manager')
        return {
            'partner': partner,
            'fpos': fpos,
            'lines': lines,
            'untaxed': untaxed,
            'tax': currency.round(total - untaxed),
            'taxes': [dict(t, amount=currency.round(t['amount'])) for t in taxes.values()],
            'total': total,
            'gross': gross,
            'discount': currency.round(gross - total),
            'payable': payable,
            'rounding': currency.round(payable - total),
            'needs_pin': needs_pin,
            'max_discount': max_discount,
        }

    def _pos_modern_quote_json(self, quote):
        return {
            'lines': [{
                'key': l['key'],
                'product_id': l['product'].id,
                'name': l['product'].with_context(display_default_code=False).display_name,
                'qty': l['qty'],
                'price_unit': l['price_unit'],
                'discount': l['discount'],
                'total': l['subtotal_incl'],
                'untaxed': l['subtotal'],
                'gross': l['gross_incl'],
                'label': l['label'],
                'free': l['free'],
            } for l in quote['lines']],
            'untaxed': quote['untaxed'],
            'tax': quote['tax'],
            'taxes': quote['taxes'],
            'total': quote['total'],
            'gross': quote['gross'],
            'discount': quote['discount'],
            'payable': quote['payable'],
            'rounding': quote['rounding'],
            'needs_pin': quote['needs_pin'],
        }

    def pos_modern_quote(self, payload):
        self.ensure_one()
        return self._pos_modern_quote_json(self._pos_modern_quote(payload or {}))

    # ------------------------------------------------------------------
    # Order
    # ------------------------------------------------------------------
    def _pos_modern_payments(self, payload, quote, partner):
        """Check the tenders and return (pos.payment commands, change)."""
        self.ensure_one()
        currency = self.currency_id
        methods = self._pos_modern_allowed_methods(partner)
        by_id = {m.id: m for m in methods}
        payments = [p for p in (payload.get('payments') or []) if _num(p.get('amount'))]
        payable = quote['payable']
        if not payments and not float_is_zero(payable, precision_rounding=currency.rounding):
            raise UserError(_("Choose how the customer pays."))
        for payment in payments:
            if int(payment.get('method_id') or 0) not in by_id:
                raise UserError(_("Choose a payment method of this shop."))
        paid = currency.round(sum(_num(p['amount']) for p in payments))
        change = 0.0
        if payable < 0 or any(_num(p['amount']) < 0 for p in payments):
            # money given back (return / exchange): exactly the amount due, no change
            if float_compare(paid, payable, precision_rounding=currency.rounding):
                raise UserError(_("%(back)s to give back, %(paid)s entered.",
                                  back=formatLang(self.env, -payable, currency_obj=currency),
                                  paid=formatLang(self.env, -paid, currency_obj=currency)))
        else:
            non_cash = currency.round(sum(_num(p['amount']) for p in payments
                                          if not by_id[int(p['method_id'])].is_cash_count))
            has_cash = any(by_id[int(p['method_id'])].is_cash_count for p in payments)
            if float_compare(paid, payable, precision_rounding=currency.rounding) < 0:
                raise UserError(_("%(paid)s paid, %(due)s still due.",
                                  paid=formatLang(self.env, paid, currency_obj=currency),
                                  due=formatLang(self.env, payable - paid, currency_obj=currency)))
            if float_compare(non_cash, payable, precision_rounding=currency.rounding) > 0:
                raise UserError(_("Card and mobile payments cannot be more than the bill: only cash gives change."))
            change = currency.round(paid - payable)
            if change and not has_cash:
                raise UserError(_("Only cash gives change: lower the amount."))
        self._pos_modern_check_payments(payments, quote, partner, payload)
        commands = []
        for payment in payments:
            method = by_id[int(payment['method_id'])]
            vals = {
                'amount': currency.round(_num(payment['amount'])),
                'name': fields.Datetime.now(),
                'payment_method_id': method.id,
                'uuid': str(uuid.uuid4()),
            }
            vals.update(self._pos_modern_payment_vals(method, payment, payload))
            commands.append((0, 0, vals))
        return commands, change

    def pos_modern_create_order(self, payload):
        """Paid order from the counter, saved exactly like an order of Odoo's register.

        :param payload: {
            'uuid': str (client id: the same order sent twice is saved once — offline queue),
            'lines': [{'product_id', 'qty', 'discount', 'note', 'key', 'extra'}],
            'bill_discount': float, 'partner_id': int, 'table_id': int, 'note': str,
            'payments': [{'method_id', 'amount', 'ref', 'phone'}],
            'pin': str, 'hold_id': int, 'extra': {...shop addons...},
        }
        """
        self.ensure_one()
        payload = dict(payload or {})
        order_uuid = payload.get('uuid') or str(uuid.uuid4())
        Order = self.env['pos.order']
        existing = Order.search([('uuid', '=', order_uuid)], limit=1)
        if existing:
            return existing._pos_modern_order_result()

        session = self.current_session_id
        if not session or session.state != 'opened':
            raise UserError(_("Open the session of %s first.", self.name))
        if not [line for line in (payload.get('lines') or []) if _num(line.get('qty'))]:
            raise UserError(_("The cart is empty."))

        quote = self._pos_modern_quote(payload)
        if quote['needs_pin'] and not self._pos_modern_pin_ok(payload.get('pin')):
            raise AccessError(_("A discount of %s%% needs a manager: type the manager PIN.",
                                round(quote['max_discount'], 2)))
        partner, fpos = quote['partner'], quote['fpos']
        payment_commands, change = self._pos_modern_payments(payload, quote, partner)

        order_lines = []
        for line in quote['lines']:
            vals = {
                'product_id': line['product'].id,
                'full_product_name': line['product'].with_context(display_default_code=False).display_name,
                'qty': line['qty'],
                'price_unit': line['price_unit'],
                'price_subtotal': line['subtotal'],
                'price_subtotal_incl': line['subtotal_incl'],
                'tax_ids': [(6, 0, line['taxes'].ids)],
                'discount': line['discount'],
                'pack_lot_ids': [],
                'uuid': str(uuid.uuid4()),
            }
            if line['note'] and 'customer_note' in self.env['pos.order.line']._fields:
                vals['customer_note'] = line['note']
            vals.update(line['vals'])
            order_lines.append((0, 0, vals))

        data = {
            'uuid': order_uuid,
            'name': _('Order %s', order_uuid),
            'session_id': session.id,
            'user_id': self.env.uid,
            'partner_id': partner.id or False,
            'pricelist_id': self.pricelist_id.id or False,
            'fiscal_position_id': fpos.id if fpos else False,
            'date_order': fields.Datetime.to_string(fields.Datetime.now()),
            'lines': order_lines,
            'payment_ids': payment_commands,
            'amount_paid': quote['payable'] + change,
            'amount_return': -change,  # Odoo's register sends the change as a negative amount
            'amount_tax': quote['tax'],
            'amount_total': quote['total'],
            'last_order_preparation_change': '{}',
            'to_invoice': False,
            'state': 'paid',
        }
        if payload.get('note'):
            data['general_customer_note'] = str(payload['note'])[:1000]
        table_id = payload.get('table_id')
        if table_id and 'table_id' in Order._fields:
            data['table_id'] = int(table_id)
        data = self._pos_modern_order_vals(data, payload, quote, partner)
        Order.with_context(current_order_uuid=order_uuid).sync_from_ui([data])
        order = Order.search([('uuid', '=', order_uuid)], limit=1)
        if not order:
            raise UserError(_("The order could not be saved."))
        if payload.get('hold_id'):
            self.env['pos.modern.hold'].browse(int(payload['hold_id'])).exists().unlink()
        try:
            with self.env.cr.savepoint():
                self._pos_modern_after_order(order, payload)
        except Exception:  # noqa: BLE001  (an SMS gateway down must not lose the sale)
            _logger.warning("pos_modern: after-order step failed for %s", order.name, exc_info=True)
        return order._pos_modern_order_result()

    # ------------------------------------------------------------------
    # Customers (search by mobile number, quick create)
    # ------------------------------------------------------------------
    def _pos_modern_customer_row(self, partner):
        return {
            'id': partner.id,
            'name': partner.name or '',
            'phone': partner.phone or '',
            'email': partner.email or '',
            'street': partner.street or '',
        }

    def pos_modern_customers(self, query='', limit=8):
        """Customers by name, e-mail, reference or mobile number (digits only, any format)."""
        self.ensure_one()
        query = (query or '').strip()
        Partner = self.env['res.partner']
        ids = []
        digits = re.sub(r'\D', '', query)
        if len(digits) >= 4:
            # "01712-345678", "+880 1712 345678" and "01712345678" are the same number
            self.env.cr.execute(
                """SELECT id FROM res_partner
                    WHERE active AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE %s
                    ORDER BY customer_rank DESC, id DESC LIMIT %s""",
                ['%' + digits[-10:] + '%', limit])
            ids = [r[0] for r in self.env.cr.fetchall()]
        domain = [('id', 'in', ids)] if ids else []
        if query and not ids:
            domain = ['|', '|', '|', ('name', 'ilike', query), ('email', 'ilike', query), ('ref', '=', query),
                      ('phone', 'ilike', query)]
        partners = Partner.search(domain or [('customer_rank', '>', 0)], limit=limit,
                                  order='customer_rank desc, name')
        return [self._pos_modern_customer_row(p) for p in partners]

    def pos_modern_quick_customer(self, name, phone='', extra=None):
        self.ensure_one()
        name = (name or '').strip() or (phone or '').strip()
        if not name:
            raise UserError(_("Type the customer's name or mobile number."))
        vals = {'name': name, 'phone': (phone or '').strip() or False, 'customer_rank': 1,
                'company_id': False}
        for key, value in (extra or {}).items():
            if key in ('email', 'street', 'city') and value:
                vals[key] = value
        partner = self.env['res.partner'].create(vals)
        return self._pos_modern_customer_row(partner)

    # ------------------------------------------------------------------
    # Held bills
    # ------------------------------------------------------------------
    def pos_modern_hold(self, payload, name=''):
        self.ensure_one()
        payload = dict(payload or {})
        quote = self._pos_modern_quote(payload) if payload.get('lines') else None
        hold_id = payload.pop('hold_id', False)
        Hold = self.env['pos.modern.hold']
        vals = {
            'config_id': self.id,
            'name': (name or '').strip()[:64] or False,
            'partner_id': int(payload['partner_id']) if payload.get('partner_id') else False,
            'table_ref': int(payload['table_id']) if payload.get('table_id') else 0,
            'table_name': payload.get('table_name') or False,
            'payload': payload,
            'amount_total': quote['total'] if quote else 0.0,
            'item_count': sum(_num(l.get('qty')) for l in payload.get('lines') or []),
        }
        hold = Hold.browse(int(hold_id)).exists() if hold_id else Hold
        if hold:
            hold.write(vals)
        else:
            hold = Hold.create(vals)
        return hold._pos_modern_row()

    def pos_modern_holds(self):
        self.ensure_one()
        return [h._pos_modern_row() for h in self.env['pos.modern.hold'].search([('config_id', '=', self.id)])]

    # ------------------------------------------------------------------
    # Tables (Point of Sale restaurant option)
    # ------------------------------------------------------------------
    @api.model
    def pos_modern_tables(self, config_id=False):
        if 'restaurant.table' not in self.env:
            return {'installed': False, 'floors': [], 'shops': [], 'config_id': False}
        restaurants = self.search([('company_id', 'in', self.env.companies.ids), ('module_pos_restaurant', '=', True)],
                                  order='name')
        config = restaurants.filtered(lambda c: c.id == config_id)[:1] or restaurants[:1]
        floors = config.floor_ids if config else self.env['restaurant.floor']
        busy = {}
        held = {}
        if config:
            for table, count in self.env['pos.order']._read_group(
                    [('config_id', '=', config.id), ('state', '=', 'draft'), ('table_id', '!=', False)],
                    ['table_id'], ['__count']):
                busy[table.id] = count
            for hold in self.env['pos.modern.hold'].search([('config_id', '=', config.id), ('table_ref', '!=', 0)]):
                held.setdefault(hold.table_ref, []).append({'id': hold.id, 'total': hold.amount_total,
                                                            'name': hold.display_name})
        return {
            'installed': True,
            'config_id': config.id if config else False,
            'config_name': config.name if config else '',
            'currency_id': config.currency_id.id if config else False,
            'shops': [{'id': c.id, 'name': c.name} for c in restaurants],
            'floors': [{
                'id': floor.id,
                'name': floor.name,
                'tables': [{
                    'id': t.id,
                    'number': t.table_number,
                    'seats': t.seats,
                    'shape': t.shape,
                    'orders': busy.get(t.id, 0) + len(held.get(t.id, [])),
                    'holds': held.get(t.id, []),
                } for t in floor.table_ids.filtered('active').sorted('table_number')],
            } for floor in floors.sorted('sequence')],
        }

    # ------------------------------------------------------------------
    # Counter settings page (a standalone form, no xpath into Odoo's)
    # ------------------------------------------------------------------
    def pos_modern_settings_action(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Counter settings · %s', self.name),
            'res_model': 'pos.config',
            'res_id': self.id,
            'views': [[self.env.ref('pos_modern.pos_config_counter_form').id, 'form']],
            'target': 'new',
        }


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    def _register_hook(self):
        super()._register_hook()
        try:
            with self.env.cr.savepoint():
                self._pos_modern_sync_tables_menu()
        except Exception:  # noqa: BLE001  (database being created / updated)
            pass

    @api.model
    def _pos_modern_sync_tables_menu(self):
        """The Tables page is only in the menu when Odoo's restaurant option is installed."""
        menu = self.env.ref('pos_modern.menu_tables', raise_if_not_found=False)
        if menu:
            wanted = 'restaurant.table' in self.env
            if menu.sudo().active != wanted:
                menu.sudo().active = wanted
