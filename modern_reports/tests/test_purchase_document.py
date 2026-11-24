from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestPurchaseDocument(ModernReportTestCommon):

    def test_rfq_render(self):
        order = self._create_purchase_order()
        html = self._render('purchase.action_report_purchase_order', order)
        self.assertIn('Request for Quotation', html)
        self.assertIn(order.name, html)
        self.assertIn('Vendor', html)
        self.assertIn('Modern Widget', html)
        self.assertIn('224.00', html)
        self.assertIn('in words', html)

    def test_confirmed_order_render(self):
        order = self._create_purchase_order(confirm=True)
        html = self._render('purchase.action_report_purchase_order', order)
        self.assertIn('Purchase Order', html)

    def test_terms_and_signature(self):
        order = self._create_purchase_order()
        order.note = '<p>Deliver to the central warehouse</p>'
        html = self._render('purchase.action_report_purchase_order', order)
        self.assertIn('Deliver to the central warehouse', html)
        self.assertIn('Authorised Signatory', html)
