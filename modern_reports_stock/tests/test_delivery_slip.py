from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestDeliverySlip(TransactionCase):

    def test_delivery_slip_uses_modern_document(self):
        partner = self.env['res.partner'].create({'name': 'MR Receiver'})
        product = self.env['product.product'].create({'name': 'MR Box', 'is_storable': True})
        picking_type = self.env.ref('stock.picking_type_out')
        picking = self.env['stock.picking'].create({
            'partner_id': partner.id,
            'picking_type_id': picking_type.id,
            'location_id': picking_type.default_location_src_id.id,
            'location_dest_id': self.env.ref('stock.stock_location_customers').id,
            'move_ids': [(0, 0, {
                'product_id': product.id,
                'product_uom_qty': 3,
                'location_id': picking_type.default_location_src_id.id,
                'location_dest_id': self.env.ref('stock.stock_location_customers').id,
            })],
        })
        values = picking._mr_values()
        self.assertEqual(values['title'], 'Delivery Slip')
        self.assertEqual(values['qty2_label'], 'Delivered')
        self.assertEqual([row['title'] for row in values['lines']], ['MR Box'])
        self.assertFalse(values['show_prices'])
        html = self.env['ir.actions.report']._render_qweb_html('stock.action_report_delivery', picking.ids)[0]
        self.assertIn(b'o_mr_band', html)
        self.assertIn(b'MR Receiver', html)
        self.assertIn(b'Delivered', html)
