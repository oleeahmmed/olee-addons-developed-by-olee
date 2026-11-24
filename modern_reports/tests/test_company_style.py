from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase


class TestCompanyStyle(TransactionCase):

    def setUp(self):
        super().setUp()
        self.company = self.env.company

    def test_default_accent_comes_from_theme(self):
        self.company.write({
            'mr_doc_accent_color': False,
            'mt_primary_color': '#123456',
            'mr_doc_background': 'white',
        })
        style = self.company._mr_doc_style()
        self.assertEqual(style['accent'], '#123456')
        self.assertEqual(style['background'], '#ffffff')
        self.assertEqual(style['border'], '#e2e8f0')

    def test_explicit_accent_overrides_theme(self):
        self.company.write({'mr_doc_accent_color': '#0f766e', 'mt_primary_color': '#123456'})
        self.assertEqual(self.company._mr_doc_style()['accent'], '#0f766e')

    def test_tint_background_mixes_accent_with_white(self):
        self.company.write({'mr_doc_accent_color': '#0f766e', 'mr_doc_background': 'tint'})
        self.assertEqual(self.company._mr_doc_style()['background'], '#ecf4f3')

    def test_custom_background_is_used_verbatim(self):
        self.company.write({'mr_doc_background': 'custom', 'mr_doc_background_color': '#f1f5f9'})
        self.assertEqual(self.company._mr_doc_style()['background'], '#f1f5f9')

    def test_invalid_colours_are_rejected(self):
        with self.assertRaises(ValidationError):
            self.company.write({'mr_doc_accent_color': 'teal'})
        with self.assertRaises(ValidationError):
            self.company.write({'mr_doc_background': 'custom', 'mr_doc_background_color': 'white'})

    def test_footer_line_lists_company_address_and_tax(self):
        self.company.write({'name': 'Modern Co', 'street': '1 Main Road', 'city': 'Dhaka', 'vat': 'VAT123'})
        footer = self.company._mr_footer_line()
        self.assertIn('Modern Co', footer)
        self.assertIn('1 Main Road', footer)
        self.assertIn('VAT123', footer)
