from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, new_test_user, tagged

from odoo.addons.modern_theme.models.theme_options import OPTIONS, contrast_foreground


@tagged("post_install", "-at_install")
class TestModernTheme(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(cls.env, login="mt_user", groups="base.group_user")

    def test_contrast_foreground(self):
        self.assertEqual(contrast_foreground("#facc15"), "#0b0f17")  # yellow -> dark text
        self.assertEqual(contrast_foreground("#4f46e5"), "#ffffff")  # indigo -> white text
        self.assertEqual(contrast_foreground("nope"), "#ffffff")

    def test_user_override_and_reset(self):
        company = self.env.company
        company.write({"mt_preset": "teal", "mt_density": "comfortable"})
        Users = self.env["res.users"].with_user(self.user)
        theme = Users.mt_set_appearance({"density": "compact", "color_mode": "dark", "animations": False})
        self.assertEqual(theme["values"]["density"], "compact")
        self.assertEqual(theme["values"]["preset"], "teal")  # still the company's
        self.assertFalse(theme["values"]["animations"])
        theme = Users.mt_set_appearance({"density": False})
        self.assertEqual(theme["values"]["density"], "comfortable")  # back to company
        theme = Users.mt_reset_appearance()
        self.assertEqual(theme["values"]["color_mode"], company.mt_color_mode)

    def test_invalid_values_rejected(self):
        Users = self.env["res.users"].with_user(self.user)
        with self.assertRaises(UserError):
            Users.mt_set_appearance({"radius": "huge"})
        with self.assertRaises(UserError):
            Users.mt_set_appearance({"primary_color": "red"})

    def test_company_defaults_admin_only(self):
        with self.assertRaises(AccessError):
            self.env["res.users"].with_user(self.user).mt_set_company_appearance({"preset": "rose"})
        self.env["res.users"].mt_set_company_appearance({"preset": "rose"})
        self.assertEqual(self.env.company.mt_preset, "rose")

    def test_html_attributes_cover_every_option(self):
        values = self.user._mt_effective()
        attrs = self.env["res.users"]._mt_html_attributes(values, "light")
        for key in OPTIONS:
            if key != "login_style":
                self.assertIn(f"data-mt-{key.replace('_', '-')}", attrs)
        values.update(preset="custom", primary_color="#123456")
        attrs = self.env["res.users"]._mt_html_attributes(values, "light")
        self.assertIn("--mt-custom-primary: #123456", attrs["style"])

    def test_favorites(self):
        Users = self.env["res.users"].with_user(self.user)
        self.assertEqual(Users.mt_set_favorites([3, "4", "x"]), [3, 4])
        self.assertEqual(self.user._mt_favorites(), [3, 4])

    def test_session_and_scheme(self):
        self.env["res.users"].with_user(self.user).mt_set_appearance({"color_mode": "dark"})
        scheme = self.env["ir.http"].with_user(self.user).color_scheme()
        self.assertEqual(scheme, "dark")
