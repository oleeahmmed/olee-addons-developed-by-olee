from collections import defaultdict

from odoo import _, api, fields, models

from .bangla import bn_amount_words, bn_digits


class PosOrder(models.Model):
    _inherit = 'pos.order'

    l10n_bd_mushak_no = fields.Char(string="Mushak no.", copy=False, readonly=True, index='btree_not_null',
                                    help="Number of the Mushak-6.3 tax invoice (or Mushak-6.7 credit note).")

    def _l10n_bd_assign_mushak(self):
        for order in self.filtered(lambda o: not o.l10n_bd_mushak_no and o.state in ('paid', 'done', 'invoiced')):
            code = 'l10n_bd_pos.mushak67' if order.amount_total < 0 else 'l10n_bd_pos.mushak63'
            order.sudo().l10n_bd_mushak_no = self.env['ir.sequence'].with_company(order.company_id).next_by_code(
                code, sequence_date=fields.Date.context_today(order, order.date_order)) or order.pos_reference

    def action_l10n_bd_print_mushak(self):
        self._l10n_bd_assign_mushak()
        return self.env.ref('l10n_bd_pos.action_report_mushak').report_action(self)

    # ------------------------------------------------------------------ tax split (VAT / SD / AT)
    def _l10n_bd_line_taxes(self, line):
        """{'sd': amount, 'vat': amount, 'at': amount, 'sd_rate': %, 'vat_rate': %} of one line."""
        order = line.order_id
        taxes = order.fiscal_position_id.map_tax(line.tax_ids) if order.fiscal_position_id else line.tax_ids
        price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
        res = taxes.compute_all(price, order.currency_id, line.qty, product=line.product_id,
                                partner=order.partner_id or None) if taxes else {'taxes': [],
                                                                                 'total_excluded': line.price_subtotal}
        out = defaultdict(float)
        out['base'] = res['total_excluded']
        for tax in res['taxes']:
            record = self.env['account.tax'].browse(tax['id'])
            kind = record.l10n_bd_kind or 'vat'
            out[kind] += tax['amount']
            if record.amount_type == 'percent':
                out[kind + '_rate'] += record.amount
        return out

    def _l10n_bd_mushak_data(self):
        self.ensure_one()
        self._l10n_bd_assign_mushak()
        lines = []
        totals = defaultdict(float)
        for index, line in enumerate(self.lines, 1):
            t = self._l10n_bd_line_taxes(line)
            qty = abs(line.qty) or 1.0
            row = {
                'index': index,
                'name': line.full_product_name or line.product_id.display_name,
                'name_bn': line.product_id.product_tmpl_id.l10n_bd_name_bn or '',
                'uom': line.product_uom_id.name,
                'qty': abs(line.qty),
                'unit_price': abs(t['base']) / qty,
                'base': abs(t['base']),
                'sd_rate': t['sd_rate'],
                'sd': abs(t['sd']),
                'vat_rate': t['vat_rate'],
                'vat': abs(t['vat']),
                'at': abs(t['at']),
                'total': abs(line.price_subtotal_incl),
            }
            for key in ('base', 'sd', 'vat', 'at', 'total'):
                totals[key] += row[key]
            lines.append(row)
        refund = self.amount_total < 0
        origin = self.lines.refunded_orderline_id.order_id[:1] if refund else self.env['pos.order']
        return {
            'refund': refund,
            'number': self.l10n_bd_mushak_no or self.pos_reference or self.name,
            'origin': (origin.l10n_bd_mushak_no or origin.pos_reference or origin.name) if origin else '',
            'origin_date': fields.Datetime.context_timestamp(self, origin.date_order) if origin else False,
            'date': fields.Datetime.context_timestamp(self, self.date_order),
            'lines': lines,
            'totals': dict(totals),
            'words': bn_amount_words(totals['total']),
        }

    # ------------------------------------------------------------------ thermal receipt
    def _pos_modern_receipt_data(self):
        data = super()._pos_modern_receipt_data()
        config = self.config_id
        company = self.company_id
        lang = config.l10n_bd_receipt_lang or 'en'
        names = {l.id: l.product_id.product_tmpl_id.l10n_bd_name_bn for l in self.lines}
        for row in data['lines']:
            bn = names.get(row.get('id')) or ''
            if lang == 'bn' and bn:
                row['name_print'] = bn
            elif lang == 'both' and bn:
                row['name_bn'] = bn
        data['company']['bin'] = company.l10n_bd_bin or ''
        if data.get('customer'):
            data['customer']['bin'] = self.partner_id.l10n_bd_bin or ''
        split = defaultdict(float)
        for line in self.lines:
            for key, value in self._l10n_bd_line_taxes(line).items():
                if not key.endswith('_rate') and key != 'base':
                    split[key] += value
        if config.l10n_bd_mushak:
            self._l10n_bd_assign_mushak()
            data['extra']['title'] = _('MUSHAK-6.7 · CREDIT NOTE') if self.amount_total < 0 else _('MUSHAK-6.3 · TAX INVOICE')
            data['extra']['mushak_no'] = self.l10n_bd_mushak_no or ''
        data['extra']['sd'] = round(split.get('sd', 0.0), 2)
        data['extra']['vat'] = round(split.get('vat', 0.0), 2)
        data['extra']['bn_digits'] = bool(config.l10n_bd_digits)
        data['extra']['words_bn'] = bn_amount_words(self.amount_total) if lang != 'en' else ''
        if config.l10n_bd_digits:
            data['extra']['digits_map'] = True
        return data

    # ------------------------------------------------------------------ VAT register
    @api.model
    def _l10n_bd_vat_register(self, date_from, date_to, config_ids=None):
        from odoo.addons.modern_theme.tools import local_midnight
        start = local_midnight(date_from, tz=self.env.tz)
        end = local_midnight(fields.Date.add(date_to, days=1), tz=self.env.tz)
        domain = [('state', 'in', ('paid', 'done', 'invoiced')), ('date_order', '>=', start), ('date_order', '<', end),
                  ('company_id', 'in', self.env.companies.ids)]
        if config_ids:
            domain.append(('config_id', 'in', list(config_ids)))
        days = defaultdict(lambda: defaultdict(float))
        rates = defaultdict(lambda: defaultdict(float))
        for order in self.search(domain, order='date_order'):
            day = fields.Datetime.context_timestamp(order, order.date_order).date()
            d = days[day]
            d['orders'] += 1
            d['total'] += order.amount_total
            if order.amount_total < 0:
                d['refunds'] += -order.amount_total
            for line in order.lines:
                t = self._l10n_bd_line_taxes(line)
                d['base'] += t['base']
                d['sd'] += t['sd']
                d['vat'] += t['vat']
                d['at'] += t['at']
                r = rates[t['vat_rate']]
                r['base'] += t['base']
                r['vat'] += t['vat']
        keys = ('orders', 'base', 'sd', 'vat', 'at', 'total', 'refunds')
        return {
            'days': [dict(day=k, **{key: v.get(key, 0.0) for key in keys}) for k, v in sorted(days.items())],
            'rates': [dict(rate=k, base=v.get('base', 0.0), vat=v.get('vat', 0.0)) for k, v in sorted(rates.items())],
            'totals': {key: sum(d.get(key, 0.0) for d in days.values()) for key in keys},
        }

    def _l10n_bd_bn(self, value):
        return bn_digits(value)
