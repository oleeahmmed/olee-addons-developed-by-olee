from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import float_compare, format_date


class PosConfig(models.Model):
    _inherit = 'pos.config'

    ph_pharmacy = fields.Boolean(string="Pharmacy counter",
                                 help="Generic search, strip / box selling, batches by expiry, prescriptions.")
    ph_fefo = fields.Boolean(string="Pick batches by expiry (FEFO)", default=True)
    ph_block_expired = fields.Boolean(string="Block expired batches", default=True)
    ph_expiry_warn_days = fields.Integer(string="Warn when expiring within (days)", default=90)
    ph_rx_mandatory = fields.Boolean(string="Prescription details mandatory", default=True,
                                     help="Doctor and patient must be typed when a prescription medicine is sold.")

    # ------------------------------------------------------------------ helpers
    def _ph_location(self):
        self.ensure_one()
        return self.picking_type_id.default_location_src_id

    def _ph_lots(self, products):
        """{product_id: [(lot, qty, expiration_date)]} of the shop's stock, nearest expiry first."""
        self.ensure_one()
        location = self._ph_location()
        if not location or not products:
            return {}
        quants = self.env['stock.quant'].sudo().search([
            ('product_id', 'in', products.ids), ('location_id', 'child_of', location.id),
            ('lot_id', '!=', False), ('quantity', '>', 0)])
        per_lot = {}
        for quant in quants:
            key = (quant.product_id.id, quant.lot_id.id)
            entry = per_lot.setdefault(key, [quant.lot_id, 0.0])
            entry[1] += quant.quantity - quant.reserved_quantity
        result = {}
        far = fields.Datetime.now() + timedelta(days=36500)
        for (product_id, __), (lot, qty) in per_lot.items():
            if qty > 0:
                result.setdefault(product_id, []).append((lot, qty, lot.expiration_date))
        for rows in result.values():
            rows.sort(key=lambda r: r[2] or far)
        return result

    # ------------------------------------------------------------------ counter hooks
    def _pos_modern_features(self):
        features = super()._pos_modern_features()
        features.update({
            'pharmacy': self.ph_pharmacy,
            'rx_mandatory': self.ph_rx_mandatory,
            'expiry_warn_days': self.ph_expiry_warn_days,
        })
        return features

    def _pos_modern_extend_rows(self, products, rows):
        rows = super()._pos_modern_extend_rows(products, rows)
        if not self.ph_pharmacy:
            return rows
        now = fields.Datetime.now()
        warn = now + timedelta(days=self.ph_expiry_warn_days or 0)
        lots = self._ph_lots(products.filtered(lambda p: p.tracking == 'lot'))
        for product, row in zip(products, rows):
            tmpl = product.product_tmpl_id
            if not tmpl.ph_is_medicine and not tmpl.ph_generic_name:
                continue
            row.update({
                'generic': tmpl.ph_generic_name or '',
                'strength': tmpl.ph_strength or '',
                'form': dict(tmpl._fields['ph_dosage_form'].selection).get(tmpl.ph_dosage_form, '') if tmpl.ph_dosage_form else '',
                'maker': tmpl.ph_manufacturer or '',
                'rx': tmpl.ph_rx_required,
                'rack': tmpl.ph_rack or '',
                'strip': tmpl.ph_strip_size or 0,
                'box': tmpl.ph_box_size or 0,
                'search_extra': ' '.join(filter(None, [row.get('search_extra', ''), tmpl.ph_generic_name,
                                                       tmpl.ph_manufacturer, tmpl.ph_strength])),
            })
            good = [l for l in lots.get(product.id, []) if not l[2] or l[2] > now]
            if good:
                expiry = good[0][2]
                row['expiry'] = format_date(self.env, expiry) if expiry else ''
                row['expiry_state'] = 'soon' if expiry and expiry <= warn else 'ok'
                row['lot_qty'] = sum(l[1] for l in good)
            elif lots.get(product.id):
                row['expiry_state'] = 'expired'
                row['expiry'] = format_date(self.env, lots[product.id][0][2]) if lots[product.id][0][2] else ''
        return rows

    def _pos_modern_search_domain(self, domain, query):
        domain = super()._pos_modern_search_domain(domain, query)
        if self.ph_pharmacy:
            domain = ['|', ('product_tmpl_id.ph_generic_name', 'ilike', query)] + domain
        return domain

    def _pos_modern_adjust_lines(self, lines, payload, partner):
        lines = super()._pos_modern_adjust_lines(lines, payload, partner)
        if not self.ph_pharmacy:
            return lines
        unit_labels = {'strip': _('strip'), 'box': _('box')}
        for line in lines:
            extra = line['extra'] or {}
            if extra.get('unit') in unit_labels and extra.get('units'):
                line['label'] = _('%(n)s %(unit)s', n=extra['units'], unit=unit_labels[extra['unit']])
        if not self.ph_fefo:
            return lines
        tracked = self.env['product.product'].browse([l['product'].id for l in lines if l['product'].tracking == 'lot'])
        if not tracked:
            return lines
        lots = self._ph_lots(tracked)
        now = fields.Datetime.now()
        used = {}
        out = []
        for line in lines:
            product = line['product']
            if product.tracking != 'lot' or line.get('refund') or line['qty'] <= 0:
                out.append(line)
                continue
            available = [l for l in lots.get(product.id, []) if not l[2] or l[2] > now]
            if not available and lots.get(product.id) and self.ph_block_expired:
                raise UserError(_("Every batch of %s in stock is expired.", product.display_name))
            remaining = line['qty']
            pieces = []
            for lot, qty, expiry in available:
                left = qty - used.get(lot.id, 0.0)
                if left <= 0 or float_compare(remaining, 0, precision_digits=4) <= 0:
                    continue
                take = min(left, remaining)
                used[lot.id] = used.get(lot.id, 0.0) + take
                remaining -= take
                pieces.append((lot, take, expiry))
            if float_compare(remaining, 0, precision_digits=4) > 0:
                if self.pm_block_no_stock:
                    raise UserError(_("Only %(qty)s of %(product)s in stock.", qty=line['qty'] - remaining,
                                      product=product.display_name))
                pieces.append((None, remaining, None))
            for index, (lot, qty, expiry) in enumerate(pieces):
                part = dict(line, qty=qty, vals=dict(line['vals']))
                if index:
                    part['key'] = '%s#%s' % (line['key'], index)
                if lot:
                    part['vals']['pack_lot_ids'] = [(0, 0, {'lot_name': lot.name})]
                    label = _('Batch %s', lot.name)
                    if expiry:
                        label += ' · ' + _('exp. %s', format_date(self.env, expiry))
                    part['label'] = ' · '.join(filter(None, [line['label'] if not index else '', label]))
                out.append(part)
        return out

    def _pos_modern_order_vals(self, vals, payload, quote, partner):
        vals = super()._pos_modern_order_vals(vals, payload, quote, partner)
        if not self.ph_pharmacy:
            return vals
        rx = (payload.get('extra') or {}).get('rx') or {}
        needs = any(l['product'].product_tmpl_id.ph_rx_required for l in quote['lines'] if l['qty'] > 0)
        if needs and self.ph_rx_mandatory and not (rx.get('doctor') and rx.get('patient')):
            raise UserError(_("A prescription medicine is in the cart: type the doctor and the patient."))
        if rx:
            vals.update({
                'ph_doctor': (rx.get('doctor') or '')[:128] or False,
                'ph_patient': (rx.get('patient') or '')[:128] or False,
                'ph_patient_age': (rx.get('age') or '')[:16] or False,
                'ph_rx_ref': (rx.get('ref') or '')[:64] or False,
            })
        return vals

    # ------------------------------------------------------------------ near-expiry page
    @api.model
    def pos_ph_expiry_data(self, days=90, config_id=False):
        days = int(days or 90)
        configs = self.browse(int(config_id)) if config_id else self.search(
            [('company_id', 'in', self.env.companies.ids), ('ph_pharmacy', '=', True)])
        locations = configs.mapped('picking_type_id.default_location_src_id')
        now = fields.Datetime.now()
        limit = now + timedelta(days=days)
        domain = [('lot_id.expiration_date', '!=', False), ('lot_id.expiration_date', '<=', limit),
                  ('quantity', '>', 0), ('location_id.usage', '=', 'internal')]
        if locations:
            domain.append(('location_id', 'child_of', locations.ids))
        rows = {}
        for quant in self.env['stock.quant'].search(domain):
            key = quant.lot_id.id
            row = rows.setdefault(key, {
                'lot': quant.lot_id.name,
                'product': quant.product_id.display_name,
                'generic': quant.product_id.product_tmpl_id.ph_generic_name or '',
                'rack': quant.product_id.product_tmpl_id.ph_rack or '',
                'expiry': format_date(self.env, quant.lot_id.expiration_date),
                'expiry_raw': fields.Datetime.to_string(quant.lot_id.expiration_date),
                'days': (quant.lot_id.expiration_date - now).days,
                'qty': 0.0,
                'uom': quant.product_uom_id.name,
                'value': 0.0,
            })
            row['qty'] += quant.quantity
            row['value'] += quant.quantity * quant.product_id.standard_price
        data = sorted(rows.values(), key=lambda r: r['expiry_raw'])
        return {
            'days': days,
            'currency_id': self.env.company.currency_id.id,
            'shops': [{'id': c.id, 'name': c.name} for c in self.search(
                [('company_id', 'in', self.env.companies.ids), ('ph_pharmacy', '=', True)])],
            'rows': data,
            'expired': len([r for r in data if r['days'] < 0]),
            'value': sum(r['value'] for r in data),
        }
