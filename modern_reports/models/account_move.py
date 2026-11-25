from odoo import models

from .document_mixin import SECTION_TYPES


class AccountMove(models.Model):
    _name = 'account.move'
    _inherit = ['account.move', 'modern.reports.document']

    def _mr_report_xmlid(self):
        return 'account.account_invoices'

    def _mr_title(self, proforma=False):
        _ = self.env._
        vendor = self.move_type in ('in_invoice', 'in_refund')
        refund = self.move_type in ('out_refund', 'in_refund')
        self_billing = self.journal_id.is_self_billing
        if vendor:
            if refund:
                title = _('Self Billing Credit Note') if self_billing else _('Vendor Credit Note')
            else:
                title = _('Self Billing Invoice') if self_billing else _('Vendor Bill')
        elif refund:
            title = _('Credit Note')
        elif self.move_type == 'out_receipt':
            title = _('Sales Receipt')
        elif self.move_type == 'in_receipt':
            title = _('Purchase Receipt')
        else:
            title = _('Sales Invoice')
        if proforma:
            return _('Proforma %s', title)
        if self.state == 'draft':
            return _('Draft %s', title)
        if self.state == 'cancel':
            return _('Cancelled %s', title)
        return title

    # ---- lines ------------------------------------------------------------

    def _mr_grouped_rows(self, line):
        """Rows of a section whose composition or prices are collapsed (Odoo 19 sections)."""
        rows = []
        hide_details, hide_prices = line.collapse_composition, line.collapse_prices
        price_key = self._mr_price_field()
        for group in line._get_child_lines():
            display_type = group.get('display_type')
            if display_type in SECTION_TYPES and not hide_details:
                show_amount = display_type == 'line_section' or not hide_prices
                rows.append(self._mr_section_row(
                    group['name'], group[price_key] if show_amount else None,
                    subsection=display_type == 'line_subsection'))
            elif display_type == 'line_note':
                rows.append(self._mr_note_row(group['name']))
            else:
                title, extra = self._mr_split_name(group['name'])
                if hide_details:
                    qty = self._mr_qty(1.0, self.env.ref('uom.product_uom_unit', raise_if_not_found=False))
                else:
                    qty = self._mr_qty(group.get('quantity', 0.0), group.get('line_uom'))
                rows.append({
                    'type': 'product', 'title': title, 'extra': extra, 'indent': 0 if hide_details else 1,
                    'qty': qty,
                    'price': '' if hide_prices else self._mr_number(group['price_subtotal']),
                    'discount': 0.0, 'discount_str': '',
                    'taxes': ', '.join(group.get('taxes') or []),
                    'amount': self._mr_money(group[price_key]) if hide_details else '',
                })
        return rows

    def _mr_line_rows(self):
        rows = []
        price_total = self._mr_price_field() == 'price_total'
        for line in self._get_move_lines_to_report():
            if line.display_type in SECTION_TYPES and (line.collapse_composition or line.collapse_prices):
                rows += self._mr_grouped_rows(line)
            elif line.display_type in SECTION_TYPES:
                amount = line.get_section_total() if price_total else line.get_section_subtotal()
                rows.append(self._mr_section_row(line.name, amount, line.display_type == 'line_subsection'))
            elif line.display_type == 'line_note':
                rows.append(self._mr_note_row(line.name))
            elif line.display_type == 'product':
                rows.append(self._mr_product_row(line, line.quantity))
        return rows

    # ---- payment ----------------------------------------------------------

    def _mr_payment_values(self, values, with_payments):
        _ = self.env._
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

        if self.move_type in ('out_invoice', 'in_refund', 'out_receipt'):
            values['payment_methods'] = self._mr_payment_methods(self.partner_bank_id)
            values['payment_reference'] = self.payment_reference or (self.name if self.name != '/' else '')
            if self.partner_bank_id:
                values['bank_account'] = self.partner_bank_id.display_name

        if self.amount_residual:
            if self.display_qr_code:
                src = self._generate_qr_code(silent_errors=True)
                if src:
                    values['qr_codes'].append({'src': src, 'caption': _('Scan with your banking app')})
            if self.display_link_qr_code:
                src = self._generate_portal_payment_qr()
                if src:
                    values['qr_codes'].append({'src': src, 'caption': _('Scan to pay online')})

        term = self.invoice_payment_term_id
        values['schedule'] += self._mr_text_lines(term.note)
        details = self.payment_term_details if term.display_on_invoice and self.show_payment_term_details else []
        if details and self._is_eligible_for_early_payment_discount(self.currency_id, self.invoice_date):
            values['schedule'].append(_(
                '%(amount)s due if paid before %(date)s',
                amount=self._mr_money(term._get_amount_due_after_discount(self.amount_total, self.amount_tax)),
                date=term._get_last_discount_date_formatted(self.invoice_date),
            ))
        if details and len(details) > 1:
            for index, item in enumerate(details, start=1):
                values['schedule'].append(_(
                    '%(index)s - Installment of %(amount)s due on %(date)s',
                    index=index, amount=self._mr_money(item.get('amount', 0.0)), date=item.get('date'),
                ))

    # ---- document ---------------------------------------------------------

    def _mr_values(self, with_payments=False, proforma=False, **options):
        self.ensure_one()
        _ = self.env._
        proforma = proforma or self.env.context.get('proforma')
        vendor = self.move_type in ('in_invoice', 'in_refund', 'in_receipt')
        refund = self.move_type in ('out_refund', 'in_refund')
        values = self._mr_base_values()
        values['company'] = self._mr_company_values(forced_vat=self.fiscal_position_id.foreign_vat)
        values['title'] = self._mr_title(proforma=proforma)
        if vendor:
            number_label, date_label = _('Bill No.'), _('Bill Date')
        elif refund:
            number_label, date_label = _('Credit Note No.'), _('Credit Note Date')
        else:
            number_label, date_label = _('Invoice No.'), _('Invoice Date')
        incoterm = self.invoice_incoterm_id.code or ''
        if incoterm and self.incoterm_location:
            incoterm = '%s, %s' % (incoterm, self.incoterm_location)
        values['info_rows'] = self._mr_rows(
            (number_label, self.name if self.name and self.name != '/' else _('Draft')),
            (date_label, self._mr_date(self.invoice_date)),
            (_('Due Date'), self._mr_date(self.invoice_date_due) if not refund else ''),
            (_('Delivery Date'), self._mr_date(self.delivery_date)),
            (_('Taxable Supply'), self._mr_date(self.taxable_supply_date) if self.show_taxable_supply_date else ''),
            (_('Source'), self.invoice_origin),
        )
        values['party'] = self._mr_party_values(
            self.partner_id, _('Vendor') if vendor else _('Customer'),
            shipping=self.partner_shipping_id if not vendor else None,
        )
        values['side_rows'] = self._mr_rows(
            (_('Customer Code') if not vendor else _('Vendor Code'), self.partner_id.ref),
            (_('Reference'), self.ref),
            (_('Reversal of'), self.reversed_entry_id.name if self.reversed_entry_id else ''),
            (_('Responsible') if vendor else _('Salesperson'), self.invoice_user_id.name),
            (_('Payment Terms'), self.invoice_payment_term_id.name),
            (_('Incoterm'), incoterm),
            (_('Currency'), self.currency_id.name if self.currency_id != self.company_id.currency_id else ''),
        )
        values['lines'] = self._mr_line_rows()
        self._mr_totals_values(values)
        values['words'] = self._mr_amount_words(self.amount_total)
        self._mr_payment_values(values, with_payments)
        values['notes'] += self._mr_text_lines(self.fiscal_position_id.note, self.taxes_legal_notes)
        values['terms'] = self._mr_text_lines(self.narration)
        values['signatures'] = (_('Prepared By'), _('Authorised Signatory')) if vendor else (
            _('Customer Signature'), _('Authorised Signatory'))
        values['footer_note'] = _('This is a computer-generated document.') if vendor else (
            _('This is a computer-generated invoice.'))
        return self._mr_finish(values)
