from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestDocumentHelpers(ModernReportTestCommon):

    def test_invoice_titles(self):
        draft = self._create_invoice(post=False)
        self.assertEqual(draft._mr_document_title(), 'Draft Invoice')
        posted = self._create_invoice()
        self.assertEqual(posted._mr_document_title(), 'Invoice')
        self.assertEqual(posted._mr_document_title(proforma=True), 'Proforma Invoice')
        refund = self._create_invoice(move_type='out_refund')
        self.assertEqual(refund._mr_document_title(), 'Credit Note')
        bill = self._create_invoice(move_type='in_invoice')
        self.assertEqual(bill._mr_document_title(), 'Vendor Bill')
        vendor_credit = self._create_invoice(move_type='in_refund')
        self.assertEqual(vendor_credit._mr_document_title(), 'Vendor Credit Note')
        cancelled = self._create_invoice(post=False)
        cancelled.button_cancel()
        self.assertEqual(cancelled._mr_document_title(), 'Cancelled Invoice')

    def test_sale_titles(self):
        quotation = self._create_sale_order()
        self.assertEqual(quotation._mr_document_title(), 'Quotation')
        order = self._create_sale_order(confirm=True)
        self.assertEqual(order._mr_document_title(), 'Sales Order')
        self.assertEqual(order.with_context(proforma=True)._mr_document_title(), 'Pro-Forma Invoice')

    def test_purchase_titles(self):
        rfq = self._create_purchase_order()
        self.assertEqual(rfq._mr_document_title(), 'Request for Quotation')
        order = self._create_purchase_order(confirm=True)
        self.assertEqual(order._mr_document_title(), 'Purchase Order')
        cancelled = self._create_purchase_order()
        cancelled.button_cancel()
        self.assertEqual(cancelled._mr_document_title(), 'Cancelled Purchase Order')

    def test_tax_columns_and_per_line_amounts(self):
        invoice = self._create_invoice()
        columns = invoice._mr_tax_columns()
        self.assertEqual(len(columns), 1)
        group_id = columns[0]['id']
        lines = invoice._mr_lines()
        self.assertEqual(len(lines), 1)
        self.assertAlmostEqual(invoice._mr_line_tax_rate(lines, group_id), 12.0)
        self.assertAlmostEqual(invoice._mr_line_tax_amount(lines, group_id), 24.0)

    def test_totals_rows_and_total(self):
        invoice = self._create_invoice()
        self.assertAlmostEqual(invoice._mr_total(), 224.0)
        rows = invoice._mr_totals_rows()
        kinds = [row['kind'] for row in rows]
        self.assertIn('subtotal', kinds)
        self.assertIn('tax', kinds)
        self.assertIn('total_tax', kinds)
        tax_row = next(row for row in rows if row['kind'] == 'tax')
        self.assertAlmostEqual(tax_row['amount'], 24.0)

    def test_amount_in_words(self):
        invoice = self._create_invoice()
        words = invoice._mr_amount_in_words()
        self.assertTrue(words.endswith('Only'))
        self.assertIn('Two Hundred', words)

    def test_discount_and_hsn_flags(self):
        invoice = self._create_invoice()
        self.assertFalse(invoice._mr_has_discount())
        self.assertFalse(invoice._mr_has_hsn())
        discounted = self._create_invoice(post=False, discount=10.0)
        self.assertTrue(discounted._mr_has_discount())

    def test_optional_meta_is_empty_without_l10n(self):
        invoice = self._create_invoice()
        self.assertEqual(invoice._mr_optional_meta(), [])

    def test_terms_text_is_plain_text(self):
        invoice = self._create_invoice()
        self.assertNotIn('<', invoice._mr_terms_text())
        order = self._create_sale_order()
        order.note = '<p>Payment within 30 days</p>'
        self.assertIn('Payment within 30 days', order._mr_terms_text())
        self.assertNotIn('<p>', order._mr_terms_text())
