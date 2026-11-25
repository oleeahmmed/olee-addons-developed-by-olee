from odoo import models


class SaleOrder(models.Model):
    _name = 'sale.order'
    _inherit = ['sale.order', 'modern.reports.document']

    def _mr_report_xmlid(self):
        return 'sale.action_report_saleorder'

    def _mr_title(self, proforma=False):
        _ = self.env._
        if proforma:
            return _('Pro-Forma Invoice')
        if self.state == 'cancel':
            return _('Cancelled Order')
        if self.state in ('draft', 'sent'):
            return _('Quotation')
        return _('Sales Order')

    def _mr_line_rows(self):
        rows = []
        price_field = self._mr_price_field()
        lines = self._get_order_lines_to_report()
        display_taxes = any(lines.tax_ids)
        collapse_prices = False
        for line in lines:
            if line.display_type == 'line_section':
                collapse_prices = line.collapse_prices
            elif line.display_type == 'line_subsection':
                collapse_prices = collapse_prices or line.collapse_prices
            uom_unit = self.env.ref('uom.product_uom_unit', raise_if_not_found=False)

            if line.display_type in ('line_section', 'line_subsection') and line.collapse_composition:
                # the section stands for its whole content, one row per tax group
                show_total = not line.is_downpayment and (
                    line.display_type == 'line_section' or not line.parent_id.collapse_prices)
                for group in line._get_grouped_section_summary(display_taxes):
                    rows.append({
                        'type': 'product', 'title': line.name or '', 'extra': '', 'indent': 0,
                        'qty': self._mr_qty(1.0, uom_unit),
                        'price': self._mr_number(group['price_subtotal']) if show_total else '',
                        'discount': 0.0, 'discount_str': '',
                        'taxes': ', '.join(group['tax_labels']),
                        'amount': self._mr_money(group[price_field]) if show_total else '',
                    })
            elif line.display_type in ('line_section', 'line_subsection'):
                show_total = not line.is_downpayment and (
                    line.display_type == 'line_section' or not line.parent_id.collapse_prices)
                rows.append(self._mr_section_row(
                    line.name, line._get_section_totals(price_field) if show_total else None,
                    subsection=line.display_type == 'line_subsection'))
            elif line.display_type == 'line_note':
                rows.append(self._mr_note_row(line.name))
            elif line.product_type == 'combo':
                rows.append(self._mr_section_row(
                    '%s x %s' % (line.name, self._mr_number(line.product_uom_qty, 'Product Unit')),
                    None if collapse_prices else line._get_combo_totals(price_field), subsection=True))
            else:
                rows.append(self._mr_product_row(
                    line, line.product_uom_qty, hide_prices=collapse_prices,
                    hide_amount=line.is_downpayment, indent=1 if line.combo_item_id else 0))
        return rows

    def _mr_values(self, proforma=False, **options):
        self.ensure_one()
        _ = self.env._
        proforma = proforma or self.env.context.get('proforma')
        quotation = self.state in ('draft', 'sent') and not proforma
        values = self._mr_base_values()
        values['company'] = self._mr_company_values(forced_vat=self.fiscal_position_id.foreign_vat)
        values['title'] = self._mr_title(proforma=proforma)
        incoterm = self.incoterm.code if 'incoterm' in self._fields and self.incoterm else ''
        if incoterm and getattr(self, 'incoterm_location', False):
            incoterm = '%s, %s' % (incoterm, self.incoterm_location)
        values['info_rows'] = self._mr_rows(
            (_('Quotation No.') if quotation else _('Order No.'), self.name),
            (_('Quotation Date') if quotation else _('Order Date'), self._mr_date(self.date_order)),
            (_('Expiration'), self._mr_date(self.validity_date) if quotation or proforma else ''),
            (_('Delivery Date'), self._mr_date(self.commitment_date)),
            (_('Source'), self.origin),
        )
        values['party'] = self._mr_party_values(
            self.partner_invoice_id or self.partner_id, _('Customer'), shipping=self.partner_shipping_id,
        )
        values['side_rows'] = self._mr_rows(
            (_('Customer Code'), self.partner_id.ref),
            (_('Reference'), self.client_order_ref),
            (_('Salesperson'), self.user_id.name),
            (_('Payment Terms'), self.payment_term_id.name),
            (_('Incoterm'), incoterm),
            (_('Currency'), self.currency_id.name if self.currency_id != self.company_id.currency_id else ''),
        )
        values['lines'] = self._mr_line_rows()
        self._mr_totals_values(values)
        values['words'] = self._mr_amount_words(self.amount_total)
        values['payment_methods'] = self._mr_payment_methods()
        values['payment_reference'] = self.reference or self.name
        values['schedule'] = self._mr_text_lines(self.payment_term_id.note)
        values['notes'] = self._mr_text_lines(self.fiscal_position_id.note)
        values['terms'] = self._mr_text_lines(self.note)
        if self.signature:
            values['customer_signature'] = {
                'image': self.signature,
                'name': self.signed_by or '',
                'date': self._mr_date(self.signed_on),
            }
        values['signatures'] = (_('Customer Signature'), _('Authorised Signatory'))
        values['footer_note'] = _('This is a computer-generated document.')
        return self._mr_finish(values)
