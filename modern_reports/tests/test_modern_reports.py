from odoo.tests import TransactionCase, tagged

from odoo.addons.modern_reports.models.amount_words import lakh_amount_words, lakh_words


@tagged('post_install', '-at_install')
class TestModernReports(TransactionCase):

    def test_lakh_words(self):
        self.assertEqual(lakh_words(140397), 'One Lakh Forty Thousand Three Hundred Ninety-Seven')
        self.assertEqual(lakh_words(12345678), 'One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight')
        self.assertEqual(lakh_amount_words(140397.75, 'Taka', 'Paisa'),
                         'One Lakh Forty Thousand Three Hundred Ninety-Seven Taka and Seventy-Five Paisa')

    def test_core_reports_use_modern_document(self):
        partner = self.env['res.partner'].create({'name': 'MR Customer'})
        move = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': partner.id,
            'invoice_line_ids': [(0, 0, {'name': 'Item', 'quantity': 2, 'price_unit': 50})],
        })
        html = self.env['ir.actions.report']._render_qweb_html('account.account_invoices', move.ids)[0]
        self.assertIn(b'o_mr_band', html)
        self.assertIn(b'MR Customer', html)
