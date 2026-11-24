from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestSaleDocument(ModernReportTestCommon):

    def test_quotation_render(self):
        order = self._create_sale_order()
        html = self._render('sale.action_report_saleorder', order)
        self.assertIn('Quotation', html)
        self.assertIn(order.name, html)
        self.assertIn('Bill To', html)
        self.assertIn('Modern Widget', html)
        self.assertIn('224.00', html)
        self.assertIn('in words', html)

    def test_confirmed_order_render(self):
        order = self._create_sale_order(confirm=True)
        html = self._render('sale.action_report_saleorder', order)
        self.assertIn('Sales Order', html)

    def test_proforma_render(self):
        order = self._create_sale_order(confirm=True)
        html = self._render('sale.action_report_pro_forma_invoice', order)
        self.assertIn('Pro-Forma Invoice', html)

    def test_terms_and_signature(self):
        order = self._create_sale_order()
        order.note = '<p>Payment within 30 days</p>'
        html = self._render('sale.action_report_saleorder', order)
        self.assertIn('Payment within 30 days', html)
        self.assertIn('Authorised Signatory', html)
