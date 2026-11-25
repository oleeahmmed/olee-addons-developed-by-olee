from odoo import models


class PurchaseOrder(models.Model):
    _name = 'purchase.order'
    _inherit = ['purchase.order', 'modern.reports.document']

    def _mr_report_xmlid(self):
        return 'purchase.action_report_purchase_order'

    def _mr_title(self, rfq=False):
        _ = self.env._
        if self.state == 'cancel':
            return _('Cancelled Purchase Order')
        if rfq or self.state in ('draft', 'sent', 'to approve'):
            return _('Request for Quotation')
        return _('Purchase Order')

    def _mr_section_amount(self, lines, index):
        """Total of the product lines that follow the section at `index`, up to the next one."""
        section = lines[index]
        stop = ('line_section',) if section.display_type == 'line_section' else ('line_section', 'line_subsection')
        total = 0.0
        for line in lines[index + 1:]:
            if line.display_type in stop:
                break
            if not line.display_type:
                total += line[self._mr_price_field()]
        return total

    def _mr_line_rows(self, show_prices):
        rows = []
        lines = self.order_line.sorted('sequence')
        for index, line in enumerate(lines):
            if line.display_type in ('line_section', 'line_subsection'):
                amount = self._mr_section_amount(lines, index) if show_prices else None
                rows.append(self._mr_section_row(line.name, amount, line.display_type == 'line_subsection'))
            elif line.display_type == 'line_note':
                rows.append(self._mr_note_row(line.name))
            else:
                row = self._mr_product_row(line, line.product_qty, hide_prices=not show_prices)
                if line.date_planned and line.date_planned.date() != (self.date_planned and self.date_planned.date()):
                    row['extra'] = ' '.join(filter(None, [row['extra'], self.env._(
                        '(expected %s)', self._mr_date(line.date_planned.date()))]))
                rows.append(row)
        return rows

    def _mr_values(self, rfq=False, **options):
        self.ensure_one()
        _ = self.env._
        rfq = rfq or self.state in ('draft', 'sent', 'to approve')
        values = self._mr_base_values()
        values['company'] = self._mr_company_values(forced_vat=self.fiscal_position_id.foreign_vat)
        values['title'] = self._mr_title(rfq=rfq)
        values['show_prices'] = not options.get('hide_prices')
        incoterm = self.incoterm_id.code or ''
        if incoterm and getattr(self, 'incoterm_location', False):
            incoterm = '%s, %s' % (incoterm, self.incoterm_location)
        values['info_rows'] = self._mr_rows(
            (_('RFQ No.') if rfq else _('Order No.'), self.name),
            (_('Order Deadline') if rfq else _('Order Date'),
             self._mr_date(self.date_order if rfq else (self.date_approve or self.date_order))),
            (_('Expected Arrival'), self._mr_date(self.date_planned)),
            (_('Source'), self.origin),
        )
        values['party'] = self._mr_party_values(self.partner_id, _('Vendor'))
        if self.dest_address_id:
            values['party']['ship_to'] = ' · '.join(part for part in (
                self.dest_address_id.name, self._mr_address(self.dest_address_id)) if part)
        values['side_rows'] = self._mr_rows(
            (_('Vendor Code'), self.partner_id.ref),
            (_('Vendor Ref.'), self.partner_ref),
            (_('Buyer'), self.user_id.name),
            (_('Payment Terms'), self.payment_term_id.name),
            (_('Incoterm'), incoterm),
            (_('Currency'), self.currency_id.name if self.currency_id != self.company_id.currency_id else ''),
        )
        values['lines'] = self._mr_line_rows(values['show_prices'])
        if values['show_prices']:
            self._mr_totals_values(values)
            values['words'] = self._mr_amount_words(self.amount_total)
            values['schedule'] = self._mr_text_lines(self.payment_term_id.note)
        values['notes'] = self._mr_text_lines(self.fiscal_position_id.note)
        values['terms'] = self._mr_text_lines(self.note)
        values['signatures'] = (_('Vendor Acknowledgement'), _('Authorised Signatory'))
        values['footer_note'] = _('This is a computer-generated document.')
        return self._mr_finish(values)
