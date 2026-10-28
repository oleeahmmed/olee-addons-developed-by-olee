"""Modern POS: the simple selling screen (Menu) and the Tables page.

Everything goes through Odoo's own Point of Sale: the products, prices (pricelist),
taxes and fiscal position of the shop, its open session, its payment methods, and the
order itself is saved with pos.order.sync_from_ui — the same call Odoo's register uses —
so stock, accounting, the session's closing and the reports all count it. No new table
or field.
"""
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import UserError

CLOSED = ('closing_control', 'closed')


class PosConfig(models.Model):
    _inherit = 'pos.config'

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
        return {
            'shops': shops,
            'config_id': config.id,
            'config_name': config.name,
            'session': {
                'id': session.id,
                'name': session.name,
                'state': session.state,
                'user': session.user_id.name,
            } if session else False,
            'cash_control': config.cash_control,
            'currency_id': currency.id,
            'currency_name': currency.name,
            'tax_included': config.iface_tax_included == 'total',
            'categories': config._pos_modern_categories(),
            'products': config._pos_modern_products(),
            'payment_methods': [{
                'id': pm.id, 'name': pm.name, 'is_cash': pm.is_cash_count,
            } for pm in config.payment_method_ids.filtered(lambda pm: pm.type != 'pay_later')],
            'restaurant': config._pos_modern_is_restaurant(),
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

    def _pos_modern_products(self, limit=400):
        self.ensure_one()
        products = self.env['product.product'].search(self._pos_modern_domain(), order='name', limit=limit)
        pricelist = self.pricelist_id
        fpos = self.default_fiscal_position_id
        currency = self.currency_id
        Tax = self.env['account.tax']
        rows = []
        for product in products:
            price = pricelist._get_product_price(product, 1.0, currency=currency) if pricelist else product.lst_price
            taxes = product.taxes_id.filtered_domain(Tax._check_company_domain(self.company_id))
            mapped = fpos.map_tax(taxes) if fpos else taxes
            price = Tax._fix_tax_included_price_company(price, taxes, mapped, self.company_id)
            amounts = mapped.compute_all(price, currency, 1.0, product=product) if mapped else {
                'total_excluded': price, 'total_included': price}
            rows.append({
                'id': product.id,
                'tmpl_id': product.product_tmpl_id.id,
                'name': product.display_name,
                'excl': amounts['total_excluded'],
                'incl': amounts['total_included'],
                'categ_ids': product.pos_categ_ids.ids,
                'image': bool(product.image_128),
                'barcode': product.barcode or '',
                'code': product.default_code or '',
            })
        return rows

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
    # Order
    # ------------------------------------------------------------------
    def pos_modern_create_order(self, lines, payment_method_id, partner_id=False, table_id=False):
        """Paid order from the Menu page, saved exactly like an order of Odoo's register.

        :param lines: [{'product_id': int, 'qty': float}]
        """
        self.ensure_one()
        session = self.current_session_id
        if not session or session.state != 'opened':
            raise UserError(_("Open the session of %s first.", self.name))
        lines = [line for line in (lines or []) if float(line.get('qty') or 0) > 0]
        if not lines:
            raise UserError(_("The cart is empty."))
        method = self.payment_method_ids.filtered(lambda pm: pm.id == payment_method_id)
        if not method:
            raise UserError(_("Choose a payment method of this shop."))

        partner = self.env['res.partner'].browse(partner_id).exists() if partner_id else self.env['res.partner']
        fpos = (partner.property_account_position_id if partner else False) or self.default_fiscal_position_id
        currency = self.currency_id
        pricelist = self.pricelist_id
        Tax = self.env['account.tax']
        products = self.env['product.product'].browse([int(line['product_id']) for line in lines]).exists()
        by_id = {p.id: p for p in products}
        order_lines = []
        for line in lines:
            product = by_id.get(int(line['product_id']))
            if not product or not product.available_in_pos:
                raise UserError(_("A product of the cart cannot be sold in the Point of Sale any more."))
            qty = float(line['qty'])
            price = pricelist._get_product_price(product, qty, currency=currency) if pricelist else product.lst_price
            taxes = product.taxes_id.filtered_domain(Tax._check_company_domain(self.company_id))
            mapped = fpos.map_tax(taxes) if fpos else taxes
            price = Tax._fix_tax_included_price_company(price, taxes, mapped, self.company_id)
            amounts = mapped.compute_all(price, currency, qty, product=product, partner=partner or None) if mapped else {
                'total_excluded': price * qty, 'total_included': price * qty}
            order_lines.append((0, 0, {
                'product_id': product.id,
                'qty': qty,
                'price_unit': price,
                'price_subtotal': amounts['total_excluded'],
                'price_subtotal_incl': amounts['total_included'],
                'tax_ids': [(6, 0, mapped.ids)],
                'discount': 0.0,
                'pack_lot_ids': [],
                'uuid': str(uuid.uuid4()),
            }))
        total_incl = currency.round(sum(l[2]['price_subtotal_incl'] for l in order_lines))
        total_excl = currency.round(sum(l[2]['price_subtotal'] for l in order_lines))
        order_uuid = str(uuid.uuid4())
        data = {
            'uuid': order_uuid,
            'name': _('Order %s', order_uuid),
            'session_id': session.id,
            'user_id': self.env.uid,
            'partner_id': partner.id or False,
            'pricelist_id': pricelist.id or False,
            'fiscal_position_id': fpos.id if fpos else False,
            'date_order': fields.Datetime.to_string(fields.Datetime.now()),
            'lines': order_lines,
            'payment_ids': [(0, 0, {
                'amount': total_incl,
                'name': fields.Datetime.now(),
                'payment_method_id': method.id,
                'uuid': str(uuid.uuid4()),
            })],
            'amount_paid': total_incl,
            'amount_return': 0,
            'amount_tax': total_incl - total_excl,
            'amount_total': total_incl,
            'last_order_preparation_change': '{}',
            'to_invoice': False,
            'state': 'paid',
        }
        if table_id and 'table_id' in self.env['pos.order']._fields:
            data['table_id'] = int(table_id)
        self.env['pos.order'].sync_from_ui([data])
        order = self.env['pos.order'].search([('uuid', '=', order_uuid)], limit=1)
        if not order:
            raise UserError(_("The order could not be saved."))
        return {
            'id': order.id,
            'name': order.pos_reference or order.name,
            'total': order.amount_total,
            'state': order.state,
        }

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
        if config:
            for table, count in self.env['pos.order']._read_group(
                    [('config_id', '=', config.id), ('state', '=', 'draft'), ('table_id', '!=', False)],
                    ['table_id'], ['__count']):
                busy[table.id] = count
        return {
            'installed': True,
            'config_id': config.id if config else False,
            'config_name': config.name if config else '',
            'shops': [{'id': c.id, 'name': c.name} for c in restaurants],
            'floors': [{
                'id': floor.id,
                'name': floor.name,
                'tables': [{
                    'id': t.id,
                    'number': t.table_number,
                    'seats': t.seats,
                    'shape': t.shape,
                    'orders': busy.get(t.id, 0),
                } for t in floor.table_ids.filtered('active').sorted('table_number')],
            } for floor in floors.sorted('sequence')],
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
