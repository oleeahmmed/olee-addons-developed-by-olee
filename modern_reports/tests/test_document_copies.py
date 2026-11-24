from odoo import fields
from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestDocumentCopies(ModernReportTestCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.invoice = cls._create_invoice()

    def test_copy_labels_switch(self):
        for report_ref, label in (
            ('modern_reports.action_report_invoice_original', 'Original'),
            ('modern_reports.action_report_invoice_duplicate', 'Duplicate'),
            ('modern_reports.action_report_invoice_triplicate', 'Triplicate'),
        ):
            html = self._render(report_ref, self.invoice)
            self.assertIn(label, html)
            self.assertIn('o_mr_copy_active', html)

    def test_print_actions_are_bound(self):
        paperformat = self.env.ref('modern_reports.paperformat_modern_documents')
        for xml_id, report_name in (
            ('modern_reports.action_report_invoice_original', 'modern_reports.report_invoice_original'),
            ('modern_reports.action_report_invoice_duplicate', 'modern_reports.report_invoice_duplicate'),
            ('modern_reports.action_report_invoice_triplicate', 'modern_reports.report_invoice_triplicate'),
            ('modern_reports.action_report_invoice_proforma_original', 'modern_reports.report_invoice_proforma_original'),
            ('modern_reports.action_report_invoice_proforma_duplicate', 'modern_reports.report_invoice_proforma_duplicate'),
            ('modern_reports.action_report_invoice_proforma_triplicate', 'modern_reports.report_invoice_proforma_triplicate'),
        ):
            action = self.env.ref(xml_id)
            self.assertEqual(action.report_name, report_name)
            self.assertEqual(action.model, 'account.move')
            self.assertEqual(action.binding_model_id.model, 'account.move')
            self.assertEqual(action.paperformat_id, paperformat)
            self.assertIn('out_invoice', action.domain)

    def test_core_actions_use_modern_paperformat(self):
        paperformat = self.env.ref('modern_reports.paperformat_modern_documents')
        for xml_id in (
            'account.account_invoices',
            'account.account_invoices_without_payment',
            'sale.action_report_saleorder',
            'sale.action_report_pro_forma_invoice',
            'purchase.action_report_purchase_order',
        ):
            self.assertEqual(self.env.ref(xml_id).paperformat_id, paperformat)

    def test_proforma_omits_payments_and_shows_title(self):
        register = self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=self.invoice.ids,
        ).create({'payment_date': fields.Date.today()})
        register._create_payments()
        html = self._render('modern_reports.action_report_invoice_proforma_original', self.invoice)
        self.assertIn('Proforma Invoice', html)
        self.assertNotIn('Amount Due', html)
