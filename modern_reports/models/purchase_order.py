from odoo import models


class PurchaseOrder(models.Model):
    _name = 'purchase.order'
    _inherit = ['purchase.order', 'modern.reports.document']

    def _mr_title(self, rfq=False):
        _ = self.env._
        if self.state == 'cancel':
            return _('Cancelled Purchase Order')
        if rfq or self.state in ('draft', 'sent', 'to approve'):
            return _('Request for Quotation')
        return _('Purchase Order')

    def _mr_values(self, rfq=False, **options):
        self.ensure_one()
        _ = self.env._
        rfq = rfq or self.state in ('draft', 'sent', 'to approve')
        values = self._mr_base_values()
        values['title'] = self._mr_title(rfq=rfq)
        values['show_prices'] = not options.get('hide_prices')
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
            (_('Vendor Ref.'), self.partner_ref),
            (_('Buyer'), self.user_id.name),
            (_('Payment Terms'), self.payment_term_id.name),
            (_('Incoterm'), self.incoterm_id.code),
        )
        values['lines'] = self._mr_line_values(
            self.order_line.sorted('sequence'), 'product_qty', show_prices=values['show_prices'])
        if values['show_prices']:
            values['totals'], values['total'] = self._mr_totals_values()
            values['words'] = self._mr_amount_words(self.amount_total)
        else:
            values['totals'], values['total'], values['words'] = [], '', ''
        values['terms'] = self._mr_text_lines(self.note)
        values['signatures'] = (_('Vendor Acknowledgement'), _('Authorised Signatory'))
        values['footer_note'] = _('This is a computer-generated document.')
        return self._mr_finish(values)
