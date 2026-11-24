from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestInvoiceDocument(ModernReportTestCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.invoice = cls._create_invoice()

    def test_header_band_and_copy_strip(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('o_mr_band', html)
        self.assertIn(self.invoice._mr_document_title(), html)
        self.assertIn('Original', html)
        self.assertIn('Duplicate', html)
        self.assertIn('Triplicate', html)
        self.assertIn('#0f766e', html)

    def test_meta_and_parties(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Invoice No', html)
        self.assertIn(self.invoice.name, html)
        self.assertIn('Bill To', html)
        self.assertIn(self.partner_a.name, html)

    def test_items_and_totals(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Modern Widget', html)
        group_name = self.invoice._mr_tax_columns()[0]['name']
        self.assertIn(group_name, html)
        self.assertIn('224.00', html)
        self.assertIn('o_mr_grand_total', html)

    def test_no_powered_by(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertNotIn('powered by', html.lower())
