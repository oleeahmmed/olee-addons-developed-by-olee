from odoo import fields
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

    def test_amount_in_words_row(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('in words', html)
        self.assertIn('Only', html)

    def test_payment_rows_for_paid_invoice(self):
        register = self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=self.invoice.ids,
        ).create({'payment_date': fields.Date.today()})
        register._create_payments()
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Amount Due', html)
        self.assertIn('Paid on', html)

    def test_vendor_bill_render(self):
        bill = self._create_invoice(move_type='in_invoice')
        html = self._render('account.account_invoices_without_payment', bill)
        self.assertIn('Vendor Bill', html)
        self.assertIn('Vendor', html)
        self.assertIn('Bill Reference', html)

    def test_background_custom_colour(self):
        self.company.write({'mr_doc_background': 'custom', 'mr_doc_background_color': '#f1f5f9'})
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('#f1f5f9', html)
        self.company.write({'mr_doc_background': 'white', 'mr_doc_background_color': '#ffffff'})

    def test_bank_and_signature_blocks(self):
        self.company.write({'bank_ids': [(0, 0, {'acc_number': '123456789'})]})
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Bank Details', html)
        self.assertIn('123456789', html)
        self.assertIn('Authorised Signatory', html)
