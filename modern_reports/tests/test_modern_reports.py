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

    def test_style_follows_document_layout(self):
        company = self.env.company
        company.write({'mr_color_source': 'document', 'primary_color': '#0E7490', 'secondary_color': '#B45309',
                       'font': 'Montserrat', 'mr_background': 'tint'})
        style = company._mr_style()
        self.assertEqual(style['accent'], '#0E7490')
        self.assertEqual(style['caption'], '#B45309')
        self.assertEqual(style['on_accent'], '#ffffff')
        self.assertEqual(style['font_class'], 'o_mr_font_Montserrat')
        self.assertIn('background-color', style['background'])
        company.write({'mr_color_source': 'custom', 'mr_accent_color': '#FDE047'})
        self.assertEqual(company._mr_style()['on_accent'], '#09090b')

    def test_sections_and_page_fill_attributes(self):
        partner = self.env['res.partner'].create({'name': 'MR Customer'})
        move = self.env['account.move'].create({
            'move_type': 'out_invoice',
            'partner_id': partner.id,
            'invoice_line_ids': [
                (0, 0, {'display_type': 'line_section', 'name': 'Apparel'}),
                (0, 0, {'name': 'Shirt', 'quantity': 2, 'price_unit': 50, 'tax_ids': False}),
                (0, 0, {'display_type': 'line_note', 'name': 'Handle with care'}),
            ],
        })
        values = move._mr_values()
        self.assertEqual([row['type'] for row in values['lines']], ['section', 'product', 'note'])
        self.assertIn('100.00', str(values['lines'][0]['amount']))
        self.assertEqual(values['page'], {'width': 190.0, 'height': 274.0})
        html = self.env['ir.actions.report']._render_qweb_html('account.account_invoices', move.ids)[0]
        self.assertIn(b'data-mr-fill="1"', html)
        self.assertIn(b'o_mr_tail', html)
