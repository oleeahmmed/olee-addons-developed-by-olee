from odoo import Command, fields
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


class ModernReportTestCommon(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.user.write({
            'group_ids': [
                Command.link(cls.env.ref('sales_team.group_sale_manager').id),
            ],
        })
        cls.company = cls.env.company
        cls.company.write({
            'mt_primary_color': '#0f766e',
            'mr_doc_accent_color': False,
            'mr_doc_background': 'white',
            'mr_doc_background_color': '#ffffff',
        })
        cls.tax_sale = cls.env['account.tax'].create({
            'name': 'GST 12%',
            'amount': 12.0,
            'amount_type': 'percent',
            'type_tax_use': 'sale',
        })
        cls.tax_purchase = cls.env['account.tax'].create({
            'name': 'VAT 12%',
            'amount': 12.0,
            'amount_type': 'percent',
            'type_tax_use': 'purchase',
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Modern Widget',
            'list_price': 100.0,
        })
        cls.vendor = cls.env['res.partner'].create({
            'name': 'Modern Vendor',
            'supplier_rank': 1,
        })

    def _create_invoice(self, move_type='out_invoice', post=True, discount=0.0):
        is_vendor = move_type in ('in_invoice', 'in_refund')
        move = self.env['account.move'].create({
            'move_type': move_type,
            'partner_id': (self.vendor if is_vendor else self.partner_a).id,
            'invoice_date': fields.Date.today(),
            'invoice_line_ids': [(0, 0, {
                'name': 'Modern Widget',
                'product_id': self.product.id,
                'quantity': 2.0,
                'price_unit': 100.0,
                'discount': discount,
                'tax_ids': [(6, 0, (self.tax_purchase if is_vendor else self.tax_sale).ids)],
            })],
        })
        if post:
            move.action_post()
        return move

    def _create_sale_order(self, confirm=False):
        order = self.env['sale.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [(0, 0, {
                'product_id': self.product.id,
                'product_uom_qty': 2.0,
                'price_unit': 100.0,
                'tax_ids': [(6, 0, self.tax_sale.ids)],
            })],
        })
        if confirm:
            order.action_confirm()
        return order

    def _create_purchase_order(self, confirm=False):
        order = self.env['purchase.order'].create({
            'partner_id': self.vendor.id,
            'order_line': [(0, 0, {
                'product_id': self.product.id,
                'product_qty': 2.0,
                'price_unit': 100.0,
                'date_planned': fields.Datetime.now(),
                'tax_ids': [(6, 0, self.tax_purchase.ids)],
            })],
        })
        if confirm:
            order.button_confirm()
        return order

    def _render(self, report_ref, records):
        html, _report_type = self.env['ir.actions.report']._render_qweb_html(report_ref, records.ids)
        return html.decode() if isinstance(html, bytes) else html
