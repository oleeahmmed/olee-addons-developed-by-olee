from odoo import models


class ModernReportsDocumentMixin(models.AbstractModel):
    _name = 'modern.reports.document.mixin'
    _description = 'Modern Reports document helpers'

    OPTIONAL_META_FIELDS = (
        ('l10n_in_place_of_supply', 'Place of Supply'),
        ('l10n_in_reverse_charge', 'Reverse Charge'),
        ('l10n_in_transport_mode', 'Transport Mode'),
        ('l10n_in_vehicle_no', 'Vehicle Number'),
        ('l10n_in_vehicle_type', 'Vehicle Type'),
    )

    # ---- hooks implemented by each document model -------------------------

    def _mr_document_kind(self):
        raise NotImplementedError

    def _mr_document_title(self, proforma=False):
        raise NotImplementedError

    def _mr_lines(self):
        raise NotImplementedError

    def _mr_line_taxes(self, line):
        raise NotImplementedError

    def _mr_line_qty(self, line):
        raise NotImplementedError

    def _mr_line_uom_name(self, line):
        return ''

    def _mr_terms_text(self):
        return ''

    # ---- shared behaviour -------------------------------------------------

    def _mr_partner(self):
        return self.partner_id

    def _mr_company(self):
        return self.company_id

    def _mr_filter_lines(self, lines):
        return lines.filtered(lambda line: getattr(line, 'display_type', 'product') in (False, 'product'))

    def _mr_line_description(self, line):
        return line.name or ''

    def _mr_line_price(self, line):
        return line.price_unit

    def _mr_line_amount(self, line):
        return self._mr_line_price(line) * self._mr_line_qty(line)

    def _mr_line_discount(self, line):
        return line.discount if 'discount' in line._fields else 0.0

    def _mr_line_subtotal(self, line):
        return line.price_subtotal

    def _mr_line_total(self, line):
        return line.price_total

    def _mr_line_hsn(self, line):
        product = line.product_id
        return product.l10n_in_hsn_code if 'l10n_in_hsn_code' in product._fields else ''

    def _mr_has_discount(self):
        return any(self._mr_line_discount(line) for line in self._mr_lines())

    def _mr_has_hsn(self):
        return any(self._mr_line_hsn(line) for line in self._mr_lines())

    def _mr_tax_columns(self):
        columns = {}
        for line in self._mr_lines():
            for tax in self._mr_line_taxes(line):
                group = tax.tax_group_id
                if group and group.id not in columns:
                    columns[group.id] = {
                        'id': group.id,
                        'name': group.name,
                        'sequence': group.sequence,
                    }
        return sorted(columns.values(), key=lambda column: (column['sequence'], column['name']))

    def _mr_line_tax_rate(self, line, group_id):
        return sum(
            tax.amount
            for tax in self._mr_line_taxes(line)
            if tax.tax_group_id.id == group_id
        )

    def _mr_line_tax_amount(self, line, group_id):
        taxes = self._mr_line_taxes(line)
        if not taxes:
            return 0.0
        currency = self.currency_id
        computed = taxes.compute_all(
            self._mr_line_subtotal(line), currency, 1.0, handle_price_include=False,
        )
        amount = 0.0
        for tax_values in computed.get('taxes', []):
            tax = self.env['account.tax'].browse(tax_values['id'])
            if tax.tax_group_id.id == group_id:
                amount += tax_values['amount']
        return currency.round(amount)

    def _mr_totals_rows(self):
        totals = self.tax_totals or {}
        same_tax_base = totals.get('same_tax_base', False)
        rows = []
        for subtotal in totals.get('subtotals', []):
            groups = subtotal.get('tax_groups') or []
            rows.append({
                'kind': 'subtotal',
                'label': subtotal.get('name') or self.env._('Untaxed Amount'),
                'amount': subtotal.get('base_amount_currency', 0.0),
                'base': None,
            })
            for group in groups:
                rows.append({
                    'kind': 'tax',
                    'label': group.get('group_name', ''),
                    'amount': group.get('tax_amount_currency', 0.0),
                    'base': None if same_tax_base else group.get('display_base_amount_currency'),
                })
        if self.amount_tax:
            rows.append({
                'kind': 'total_tax',
                'label': self.env._('Total Tax'),
                'amount': self.amount_tax,
                'base': None,
            })
        if 'cash_rounding_base_amount_currency' in totals:
            rows.append({
                'kind': 'rounding',
                'label': self.env._('Rounding'),
                'amount': totals['cash_rounding_base_amount_currency'],
                'base': None,
            })
        return rows

    def _mr_total(self):
        return (self.tax_totals or {}).get('total_amount_currency', 0.0)

    def _mr_amount_in_words(self):
        if not self.currency_id or not self.amount_total:
            return ''
        return '%s Only' % self.currency_id.amount_to_text(self.amount_total)

    def _mr_optional_meta(self):
        result = []
        for field_name, label in self.OPTIONAL_META_FIELDS:
            field = self._fields.get(field_name)
            if not field:
                continue
            value = self[field_name]
            if field.type == 'boolean':
                if value:
                    result.append({'label': self.env._(label), 'value': self.env._('Yes')})
                continue
            if not value:
                continue
            if field.type == 'selection':
                value = dict(field.selection or []).get(value, value)
            result.append({'label': self.env._(label), 'value': value})
        return result
