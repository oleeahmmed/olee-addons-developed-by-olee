from odoo import models


class SaleOrder(models.Model):
    _name = 'sale.order'
    _inherit = ['sale.order', 'modern.reports.document']

    def _mr_title(self, proforma=False):
        _ = self.env._
        if proforma:
            return _('Pro-Forma Invoice')
        if self.state == 'cancel':
            return _('Cancelled Order')
        if self.state in ('draft', 'sent'):
            return _('Quotation')
        return _('Sales Order')

    def _mr_values(self, proforma=False, **options):
        self.ensure_one()
        _ = self.env._
        proforma = proforma or self.env.context.get('proforma')
        quotation = self.state in ('draft', 'sent') and not proforma
        values = self._mr_base_values()
        values['title'] = self._mr_title(proforma=proforma)
        values['info_rows'] = self._mr_rows(
            (_('Quotation No.') if quotation else _('Order No.'), self.name),
            (_('Quotation Date') if quotation else _('Order Date'), self._mr_date(self.date_order)),
            (_('Valid Until'), self._mr_date(self.validity_date) if quotation or proforma else ''),
            (_('Source'), self.origin),
        )
        values['party'] = self._mr_party_values(
            self.partner_invoice_id or self.partner_id, _('Customer'), shipping=self.partner_shipping_id,
        )
        values['side_rows'] = self._mr_rows(
            (_('Reference'), self.client_order_ref),
            (_('Salesperson'), self.user_id.name),
            (_('Payment Terms'), self.payment_term_id.name),
            (_('Incoterm'), self.incoterm.code if 'incoterm' in self._fields else ''),
        )
        values['lines'] = self._mr_line_values(self._get_order_lines_to_report(), 'product_uom_qty')
        values['totals'], values['total'] = self._mr_totals_values()
        values['words'] = self._mr_amount_words(self.amount_total)
        values['payment_methods'] = self._mr_payment_methods()
        values['payment_reference'] = self.reference or self.name
        values['terms'] = self._mr_text_lines(self.note)
        values['signatures'] = (_('Customer Signature'), _('Authorised Signatory'))
        values['footer_note'] = _('This is a computer-generated document.')
        return self._mr_finish(values)
