from odoo import models
from odoo.tools import html2plaintext


class SaleOrder(models.Model):
    _inherit = ['sale.order', 'modern.reports.document.mixin']

    def _mr_document_kind(self):
        return 'sale_order'

    def _mr_document_title(self, proforma=False):
        self.ensure_one()
        if proforma or self.env.context.get('proforma'):
            return self.env._('Pro-Forma Invoice')
        if self.state in ('draft', 'sent'):
            return self.env._('Quotation')
        return self.env._('Sales Order')

    def _mr_lines(self):
        return self._mr_filter_lines(self._get_order_lines_to_report())

    def _mr_line_taxes(self, line):
        return line.tax_ids

    def _mr_line_qty(self, line):
        return line.product_uom_qty

    def _mr_line_uom_name(self, line):
        return line.product_uom_id.name or ''

    def _mr_terms_text(self):
        self.ensure_one()
        parts = [
            html2plaintext(self.note or ''),
            html2plaintext(self.payment_term_id.note or ''),
        ]
        return '\n'.join(part for part in parts if part)
