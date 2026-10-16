"""Upgrade guard for the sales part of Modern CRM (skipped when Sales is not installed).

    odoo-bin -c odoo.conf -d <db> -u crm_modern --test-tags /crm_modern --stop-after-init
"""
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestCrmModernSale(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if 'sale.order' not in cls.env or 'opportunity_id' not in cls.env['sale.order']._fields:
            cls.skipTest(cls, "Sales (sale_crm) is not installed")
        cls.partner = cls.env['res.partner'].create({'name': 'Modern CRM customer'})
        cls.lead = cls.env['crm.lead'].create({
            'name': 'Modern CRM deal', 'type': 'opportunity', 'partner_id': cls.partner.id,
        })
        cls.product = cls.env['product.product'].create({'name': 'Modern CRM service', 'list_price': 100.0})

    def test_features_and_views(self):
        self.assertIn('sale', self.env['crm.lead'].crm_modern_features())
        ids = self.env['crm.lead'].crm_modern_view_ids()
        missing = sorted(k for k in ids if (k.startswith('quotation_') or k.startswith('order_')) and not ids[k])
        self.assertFalse(missing, f"Sales views no longer found after update: {missing}")
        for xmlid in ('sale_crm.sale_action_quotations_new', 'sale_crm.crm_quotation_partner_action',
                      'sale.action_report_saleorder', 'sale.action_view_sale_advance_payment_inv'):
            self.assertTrue(self.env.ref(xmlid, raise_if_not_found=False), f"{xmlid} is gone")

    def test_full_flow_new_quotation_confirm(self):
        action = self.lead.action_sale_quotations_new()
        self.assertEqual(action['res_model'], 'sale.order')
        self.assertEqual(action['context']['default_opportunity_id'], self.lead.id)

        order = self.env['sale.order'].with_context(action['context']).create({
            'partner_id': self.partner.id,
            'order_line': [(0, 0, {'product_id': self.product.id, 'product_uom_qty': 2})],
        })
        self.assertEqual(order.opportunity_id, self.lead)
        data = self.env['crm.lead'].crm_modern_sale_data(self.lead.id)
        self.assertEqual((data['quotation_count'], data['sale_order_count']), (1, 0))

        send = order.action_quotation_send()
        self.assertEqual(send['res_model'], 'mail.compose.message')

        order.action_confirm()
        data = self.env['crm.lead'].crm_modern_sale_data(self.lead.id)
        self.assertEqual((data['quotation_count'], data['sale_order_count']), (0, 1))
        self.assertEqual(data['orders'][0]['state'], 'sale')

        dash = self.env['crm.lead'].crm_modern_sale_dashboard()
        self.assertGreaterEqual(dash['orders_month'], 1)

    def test_quick_quotation_from_record_page(self):
        lead = self.env['crm.lead'].create({'name': 'Quick quote deal', 'type': 'opportunity', 'partner_name': 'Quick Quote Ltd'})
        with self.assertRaises(UserError):
            lead.crm_modern_quick_quotation([{'product_id': self.product.id, 'qty': 1}])
        customer = lead.crm_modern_set_customer()
        self.assertTrue(customer and lead.partner_id.id == customer['id'])

        draft = lead.crm_modern_quick_quotation([{'product_id': self.product.id, 'qty': 3, 'price_unit': 80}], 'draft')
        order = self.env['sale.order'].browse(draft['order_id'])
        self.assertEqual((order.state, order.opportunity_id, order.partner_id), ('draft', lead, lead.partner_id))
        self.assertEqual(order.order_line.price_unit, 80)

        sent = lead.crm_modern_quick_quotation([{'product_id': self.product.id, 'qty': 1}], 'send')
        self.assertEqual(sent['action']['res_model'], 'mail.compose.message')

        confirmed = lead.crm_modern_quick_quotation([{'product_id': self.product.id, 'qty': 1}], 'confirm')
        self.assertEqual(self.env['sale.order'].browse(confirmed['order_id']).state, 'sale')
        data = self.env['crm.lead'].crm_modern_sale_data(lead.id)
        self.assertEqual((data['quotation_count'], data['sale_order_count']), (2, 1))
