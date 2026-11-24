from odoo import models


class AccountMove(models.Model):
    _name = 'account.move'
    _inherit = ['account.move', 'modern.reports.document']

    def _mr_title(self, proforma=False):
        _ = self.env._
        vendor = self.move_type in ('in_invoice', 'in_refund')
        refund = self.move_type in ('out_refund', 'in_refund')
        if vendor:
            title = _('Vendor Credit Note') if refund else _('Vendor Bill')
        elif refund:
            title = _('Credit Note')
        else:
            title = _('Sales Invoice')
        if proforma:
            return _('Proforma %s', title)
        if self.state == 'draft':
            return _('Draft %s', title)
        if self.state == 'cancel':
            return _('Cancelled %s', title)
        return title

    def _mr_values(self, with_payments=False, proforma=False, **options):
        self.ensure_one()
        _ = self.env._
        proforma = proforma or self.env.context.get('proforma')
        vendor = self.move_type in ('in_invoice', 'in_refund')
        values = self._mr_base_values()
        values['title'] = self._mr_title(proforma=proforma)
        values['info_rows'] = self._mr_rows(
            (_('Bill No.') if vendor else _('Invoice No.'), self.name if self.name and self.name != '/' else _('Draft')),
            (_('Bill Date') if vendor else _('Invoice Date'), self._mr_date(self.invoice_date)),
            (_('Due Date'), self._mr_date(self.invoice_date_due) if self.move_type in ('out_invoice', 'in_invoice') else ''),
            (_('Source'), self.invoice_origin),
        )
        values['party'] = self._mr_party_values(
            self.partner_id, _('Vendor') if vendor else _('Customer'),
            shipping=self.partner_shipping_id if not vendor else None,
        )
        values['side_rows'] = self._mr_rows(
            (_('Reference'), self.ref),
            (_('Responsible') if vendor else _('Salesperson'), self.invoice_user_id.name),
            (_('Payment Terms'), self.invoice_payment_term_id.name),
            (_('Incoterm'), self.invoice_incoterm_id.code if 'invoice_incoterm_id' in self._fields else ''),
        )
        values['lines'] = self._mr_line_values(self._get_move_lines_to_report(), 'quantity')
        values['totals'], values['total'] = self._mr_totals_values()
        values['words'] = self._mr_amount_words(self.amount_total)

        if with_payments and self.state == 'posted' and self.payment_state != 'invoicing_legacy':
            widget = self.sudo().invoice_payments_widget or {}
            for payment in widget.get('content', []):
                if payment.get('is_exchange'):
                    continue
                label = _('Reversed on %s') if payment.get('is_refund') else _('Paid on %s')
                values['payments'].append((label % self._mr_date(payment['date']),
                                           self._mr_money(payment['amount'])))
            if values['payments']:
                values['amount_due'] = self._mr_money(self.amount_residual)

        if not vendor:
            values['payment_methods'] = self._mr_payment_methods()
            values['payment_reference'] = self.payment_reference or (self.name if self.name != '/' else '')
        values['terms'] = self._mr_text_lines(self.narration)
        values['signatures'] = (_('Prepared By'), _('Authorised Signatory')) if vendor else (
            _('Customer Signature'), _('Authorised Signatory'))
        values['footer_note'] = _('This is a computer-generated document.') if vendor else (
            _('This is a computer-generated invoice.'))
        return self._mr_finish(values)
