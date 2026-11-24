from odoo import models
from odoo.tools import html2plaintext


class PurchaseOrder(models.Model):
    _inherit = ['purchase.order', 'modern.reports.document.mixin']

    def _mr_document_kind(self):
        return 'purchase_order'

    def _mr_document_title(self, proforma=False):
        self.ensure_one()
        if self.state == 'cancel':
            return self.env._('Cancelled Purchase Order')
        if self.state in ('draft', 'sent', 'to approve'):
            return self.env._('Request for Quotation')
        return self.env._('Purchase Order')

    def _mr_lines(self):
        return self._mr_filter_lines(self.order_line)

    def _mr_line_taxes(self, line):
        return line.tax_ids

    def _mr_line_qty(self, line):
        return line.product_qty

    def _mr_line_uom_name(self, line):
        return line.product_uom_id.name or ''

    def _mr_terms_text(self):
        self.ensure_one()
        return html2plaintext(self.note or '')
