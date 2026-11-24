from odoo import models
from odoo.tools import html2plaintext


class AccountMove(models.Model):
    _inherit = ['account.move', 'modern.reports.document.mixin']

    def _mr_document_kind(self):
        return 'account_move'

    def _mr_document_title(self, proforma=False):
        self.ensure_one()
        move_type = self.move_type
        state = self.state
        self_billing = self.journal_id.is_self_billing
        if proforma:
            if move_type == 'out_invoice':
                return {
                    'posted': self.env._('Proforma Invoice'),
                    'draft': self.env._('Draft Proforma Invoice'),
                    'cancel': self.env._('Cancelled Proforma Invoice'),
                }.get(state, self.env._('Proforma Invoice'))
            if move_type == 'out_refund':
                return {
                    'posted': self.env._('Proforma Credit Note'),
                    'draft': self.env._('Draft Proforma Credit Note'),
                    'cancel': self.env._('Cancelled Proforma Credit Note'),
                }.get(state, self.env._('Proforma Credit Note'))
            if move_type == 'in_refund':
                return self.env._('Proforma Vendor Credit Note')
            return self.env._('Proforma Vendor Bill')
        if move_type == 'out_invoice':
            return {
                'posted': self.env._('Invoice'),
                'draft': self.env._('Draft Invoice'),
                'cancel': self.env._('Cancelled Invoice'),
            }.get(state, self.env._('Invoice'))
        if move_type == 'out_refund':
            return {
                'posted': self.env._('Credit Note'),
                'draft': self.env._('Draft Credit Note'),
                'cancel': self.env._('Cancelled Credit Note'),
            }.get(state, self.env._('Credit Note'))
        if move_type == 'in_refund':
            return self.env._('Self Billing Credit Note') if self_billing else self.env._('Vendor Credit Note')
        if move_type == 'in_invoice':
            return self.env._('Self Billing') if self_billing else self.env._('Vendor Bill')
        return self.env._('Invoice')

    def _mr_lines(self):
        return self._mr_filter_lines(self.invoice_line_ids)

    def _mr_line_taxes(self, line):
        return line.tax_ids

    def _mr_line_qty(self, line):
        return line.quantity

    def _mr_line_uom_name(self, line):
        return line.product_uom_id.name or ''

    def _mr_terms_text(self):
        self.ensure_one()
        return html2plaintext(self.invoice_payment_term_id.note or '')
