"""Upgrade guard for Sales Modern.

Run after every Odoo update:
    odoo-bin -c odoo.conf -d <db> -u sales_modern --test-tags /sales_modern --stop-after-init

If an Odoo update renames a view, action, field or method this addon relies on,
one of these tests fails and names it, instead of the UI breaking later.
"""
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestSalesModern(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.SaleOrder = cls.env['sale.order']
        cls.partner = cls.env['res.partner'].create({'name': 'Sales Modern customer', 'email': 'customer@example.com'})
        cls.product = cls.env['product.product'].create({'name': 'Sales Modern service', 'list_price': 100.0, 'type': 'service'})

    def test_views_and_actions_still_exist(self):
        ids = self.SaleOrder.sales_modern_view_ids()
        missing = sorted(key for key, value in ids.items() if not value)
        self.assertFalse(missing, f"Views no longer found after update: {missing}")
        for xmlid in ('sale.action_view_sale_advance_payment_inv', 'sale.action_sale_config_settings',
                      'sales_team.crm_team_action_config', 'product.product_category_action_form',
                      'sales_team.sales_team_crm_tag_action', 'product.product_pricelist_action2'):
            self.assertTrue(self.env.ref(xmlid, raise_if_not_found=False), f"{xmlid} is gone")
        for name in ('dashboard', 'quotations', 'orders', 'to_invoice', 'customers', 'products', 'teams', 'salespeople'):
            self.assertEqual(self.env.ref(f'sales_modern.action_{name}').tag, f'sales_modern.{name}')
        report_fields = self.env['sale.report']._fields
        for name in ('price_subtotal', 'untaxed_amount_to_invoice', 'date', 'state', 'product_id', 'partner_id'):
            self.assertIn(name, report_fields, f"sale.report.{name} is gone")

    def test_lives_inside_the_sales_app(self):
        """No app of its own: opening Sales from the home screen opens the Sales Modern dashboard."""
        root = self.env.ref('sale.sale_menu_root')
        self.assertEqual(self.env.ref('sales_modern.menu_dashboard').parent_id, root)
        menus = self.env['ir.ui.menu'].load_web_menus(False)
        self.assertEqual(menus[root.id]['actionID'], self.env.ref('sales_modern.action_dashboard').id)
        for xmlid in ('sale.sale_order_menu', 'sale.menu_sale_report', 'sale.menu_sale_config'):
            self.assertEqual(self.env.ref(xmlid).parent_id, root, f"{xmlid} moved")
        self.assertFalse(self.env['ir.module.module'].search([('name', '=', 'sales_modern')]).application)

    def test_standard_flow_and_dashboard(self):
        """Quotation → send → confirm with Odoo's own methods, then the dashboard figures."""
        order = self.SaleOrder.create({
            'partner_id': self.partner.id,
            'order_line': [(0, 0, {'product_id': self.product.id, 'product_uom_qty': 2})],
        })
        self.assertEqual(order.order_line.price_unit, 100)
        self.assertEqual(order.action_quotation_send()['res_model'], 'mail.compose.message')
        self.SaleOrder.create({'partner_id': self.partner.id,
                               'order_line': [(0, 0, {'product_id': self.product.id})]})
        order.action_confirm()
        self.assertEqual(order.state, 'sale')

        data = self.SaleOrder.sales_modern_dashboard()
        self.assertEqual(len(data['trend']), 6)
        for key in ('open_count', 'open_amount', 'month_count', 'month_amount', 'invoice_count', 'invoice_amount', 'conversion'):
            self.assertIn(key, data['kpis'])
        self.assertGreaterEqual(data['kpis']['open_count'], 1)
        self.assertGreaterEqual(data['kpis']['month_count'], 1)
        self.assertIn(self.product.id, [p['id'] for p in data['top_products']])

        team = self.env['crm.team'].create({'name': 'Sales Modern team'})
        self.SaleOrder.create({'partner_id': self.partner.id, 'team_id': team.id,
                               'order_line': [(0, 0, {'product_id': self.product.id})]})
        team.invalidate_recordset()
        self.assertEqual(team.sales_modern_quotation_count, 1)
        self.assertEqual(team.sales_modern_open_quotations()['context'], {'sales_modern_team_id': team.id})
        kanban = self.env.ref('sales_modern.crm_team_kanban_sales_modern')
        self.env['crm.team'].get_view(kanban.id, 'kanban')

    def test_modern_document_layout(self):
        """The Modern layout is a real Odoo document layout and renders a sales order PDF/HTML."""
        layout = self.env.ref('sales_modern.report_layout_modern')
        self.assertEqual(layout.view_id, self.env.ref('sales_modern.external_layout_modern'))
        self.env.company.external_report_layout_id = layout.view_id
        order = self.SaleOrder.create({
            'partner_id': self.partner.id,
            'order_line': [(0, 0, {'product_id': self.product.id, 'product_uom_qty': 3})],
        })
        html, _ = self.env['ir.actions.report']._render_qweb_html('sale.action_report_saleorder', order.ids)
        html = html.decode()
        for marker in ('o_report_layout_modern', 'o_ml_company_name', order.name):
            self.assertIn(marker, html)

    def test_owner_dashboard(self):
        """The owner dashboard: every period, the team filter, the comparison and the rights."""
        from datetime import date
        from odoo.addons.sales_modern.models.sale_dashboard import period_bounds
        # same span of the previous period, never past its end
        self.assertEqual(period_bounds(date(2026, 10, 17), 'month'), (date(2026, 10, 1), date(2026, 10, 18), date(2026, 9, 1), date(2026, 9, 18)))
        self.assertEqual(period_bounds(date(2026, 3, 31), 'month')[2:], (date(2026, 2, 1), date(2026, 3, 1)))
        self.assertEqual(period_bounds(date(2026, 5, 2), 'quarter')[0], date(2026, 4, 1))

        team = self.env['crm.team'].create({'name': 'Owner dashboard team'})
        order = self.SaleOrder.create({
            'partner_id': self.partner.id, 'team_id': team.id,
            'order_line': [(0, 0, {'product_id': self.product.id, 'product_uom_qty': 3})],
        })
        order.action_confirm()
        self.env.flush_all()  # sale.report is an SQL view over the order lines
        for period in ('month', 'quarter', 'year'):
            data = self.SaleOrder.sales_modern_owner_dashboard(period)
            self.assertEqual(len(data['months']), 12)
            self.assertEqual(len(data['sparks']['revenue']), 12)
            for key in ('revenue', 'revenue_delta', 'orders', 'avg_order', 'customers', 'new_customers', 'conversion',
                        'open_quotes', 'open_amount', 'to_invoice_amount'):
                self.assertIn(key, data['kpis'])
            self.assertGreaterEqual(data['kpis']['revenue'], 300)
        data = self.SaleOrder.sales_modern_owner_dashboard('month', team.id)
        self.assertEqual(data['kpis']['revenue'], 300)
        self.assertEqual(data['kpis']['orders'], 1)
        self.assertEqual([t['id'] for t in data['teams']], [team.id])
        self.assertIn(self.partner.id, [c['id'] for c in data['customers']])
        self.assertIn('expiring', {a['key'] for a in data['attention']})

        # a salesperson limited to his own documents sees none of the admin's sales
        seller = self.env['res.users'].create({
            'name': 'Own documents seller', 'login': 'sales_modern_owner_dash_seller',
            'group_ids': [(6, 0, [self.env.ref('sales_team.group_sale_salesman').id])],
        })
        own = self.SaleOrder.with_user(seller).sales_modern_owner_dashboard('month', team.id)
        self.assertEqual(own['kpis']['revenue'], 0)
        self.assertEqual(own['kpis']['orders'], 0)
