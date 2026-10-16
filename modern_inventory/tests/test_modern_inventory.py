"""Upgrade guard for Inventory Modern.

Run after every Odoo update:
    odoo-bin -c odoo.conf -d <db> -u modern_inventory --test-tags /modern_inventory --stop-after-init

If an Odoo update renames a view, menu, field or method this addon relies on,
one of these tests fails and names it, instead of the UI breaking later.
"""
from datetime import date

from odoo.tests import HttpCase, TransactionCase, tagged

from odoo.addons.modern_inventory.models.stock_dashboard import period_bounds


@tagged('post_install', '-at_install')
class TestInventoryModern(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Picking = cls.env['stock.picking']
        cls.warehouse = cls.env['stock.warehouse'].search([('company_id', '=', cls.env.company.id)], limit=1)
        cls.stock = cls.warehouse.lot_stock_id
        cls.product = cls.env['product.product'].create({
            'name': 'Inventory Modern box', 'is_storable': True, 'standard_price': 50.0,
        })
        cls.partner = cls.env['res.partner'].create({'name': 'Inventory Modern customer'})

    def test_views_menus_and_actions_still_exist(self):
        ids = self.Picking.modern_inventory_view_ids()
        missing = sorted(key for key, value in ids.items() if not value)
        self.assertFalse(missing, f"Views no longer found after update: {missing}")
        for name in ('dashboard', 'receipts', 'deliveries', 'internal', 'products', 'stock', 'moves'):
            self.assertEqual(self.env.ref(f'modern_inventory.action_{name}').tag, f'modern_inventory.{name}')
        # Odoo menus the sidebar merges, replaces or shows in the top bar
        for xmlid in ('stock.menu_stock_root', 'stock.stock_picking_type_menu', 'stock.menu_stock_warehouse_mgmt',
                      'stock.menu_stock_inventory_control', 'stock.menu_warehouse_report', 'stock.menu_stock_config_settings',
                      'stock.in_picking', 'stock.out_picking', 'stock.int_picking', 'stock.menu_product_variant_config_stock',
                      'stock.action_replenishment', 'stock.stock_picking_type_action', 'stock.action_report_delivery'):
            self.assertTrue(self.env.ref(xmlid, raise_if_not_found=False), f"{xmlid} is gone")
        for model, names in {
            'stock.picking': ('picking_type_code', 'scheduled_date', 'date_done', 'state', 'backorder_id', 'priority'),
            'stock.move.line': ('picking_code', 'quantity', 'date', 'state'),
            'stock.quant': ('quantity', 'location_id', 'product_id'),
            'stock.warehouse.orderpoint': ('qty_to_order', 'qty_forecast', 'product_min_qty', 'trigger'),
            'product.product': ('is_storable', 'standard_price', 'qty_available'),
        }.items():
            for name in names:
                self.assertIn(name, self.env[model]._fields, f"{model}.{name} is gone")

    def test_lives_inside_the_inventory_app(self):
        """No app of its own: opening Inventory from the home screen opens the Inventory Modern dashboard."""
        root = self.env.ref('stock.menu_stock_root')
        self.assertEqual(self.env.ref('modern_inventory.menu_dashboard').parent_id, root)
        menus = self.env['ir.ui.menu'].load_web_menus(False)
        self.assertEqual(menus[root.id]['actionID'], self.env.ref('modern_inventory.action_dashboard').id)
        self.assertFalse(self.env['ir.module.module'].search([('name', '=', 'modern_inventory')]).application)

    def test_dashboard(self):
        self.assertEqual(period_bounds(date(2026, 10, 17), 'month')[2:], (date(2026, 9, 1), date(2026, 9, 18)))
        # 10 boxes on the shelf, then deliver 4 with Odoo's own flow
        self.env['stock.quant']._update_available_quantity(self.product, self.stock, 10)
        out_type = self.warehouse.out_type_id
        picking = self.Picking.create({
            'picking_type_id': out_type.id, 'partner_id': self.partner.id,
            'location_id': self.stock.id, 'location_dest_id': self.env.ref('stock.stock_location_customers').id,
            'move_ids': [(0, 0, {'product_id': self.product.id, 'product_uom_qty': 4,
                                 'location_id': self.stock.id, 'location_dest_id': self.env.ref('stock.stock_location_customers').id})],
        })
        picking.action_confirm()
        picking.action_assign()
        picking.move_ids.quantity = 4
        picking.button_validate()
        self.assertEqual(picking.state, 'done')
        self.env.flush_all()

        for period in ('month', 'quarter', 'year'):
            data = self.Picking.modern_inventory_dashboard(period)
            self.assertEqual(len(data['months']), 12)
            self.assertEqual({o['code'] for o in data['ops']}, {'incoming', 'outgoing', 'internal'})
            for key in ('stock_value', 'in_stock', 'out_of_stock', 'to_reorder', 'units_out', 'units_in'):
                self.assertIn(key, data['kpis'])
            self.assertGreaterEqual(data['kpis']['units_out'], 4)
        data = self.Picking.modern_inventory_dashboard('month', self.warehouse.id)
        self.assertGreaterEqual(data['kpis']['stock_value'], 6 * 50.0)
        self.assertIn(self.product.id, [m['id'] for m in data['movers']])
        self.assertEqual([w['id'] for w in data['warehouses']], [self.warehouse.id])
        self.assertIn(picking.id, [p['id'] for p in data['recent']])


@tagged('post_install', '-at_install')
class TestInventoryModernUi(HttpCase):
    """The pages really render in a browser (catches template / JavaScript errors after an update)."""

    def _open(self, path, selector):
        code = """
            const deadline = Date.now() + 30000;
            (function wait() {
                if (document.querySelector('%s') && document.querySelector('.o_im_sidebar')) {
                    console.log('test successful');
                } else if (Date.now() > deadline) {
                    console.error('%s did not render');
                } else {
                    setTimeout(wait, 250);
                }
            })();
        """ % (selector, path)
        self.browser_js(path, code, login='admin', timeout=60)

    def test_dashboard_renders(self):
        self._open('/odoo/modern-inventory', '.od-kpi')

    def test_receipts_page_renders(self):
        self._open('/odoo/modern-inventory-receipts', '.o_list_view, .o_kanban_view')

    def test_stock_page_renders(self):
        self._open('/odoo/modern-inventory-stock', '.o_list_view, .o_pivot_view')
