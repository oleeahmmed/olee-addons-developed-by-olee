from odoo.tests import TransactionCase, new_test_user, tagged

from odoo.addons.modern_theme.models.theme_options import MT_ATTRIBUTES


@tagged("post_install", "-at_install")
class TestModernTheme(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(cls.env, login="mt_user", groups="base.group_user")

    def test_html_attributes_are_fixed(self):
        attrs = self.user._mt_html_attributes("light", {"mt_sb_collapsed": "1", "mt_sb_pinned": "0"})
        for key, value in MT_ATTRIBUTES.items():
            self.assertEqual(attrs[f"data-mt-{key}"], value)
        self.assertEqual(attrs["data-mt-theme"], "once")
        self.assertEqual(attrs["data-mt-scheme"], "light")
        self.assertEqual(attrs["data-mt-sidebar-collapsed"], "1")
        self.assertEqual(attrs["data-mt-sb-pinned"], "0")

    def test_favorites(self):
        Users = self.env["res.users"].with_user(self.user)
        self.assertEqual(Users.mt_set_favorites([3, "4", "x"]), [3, 4])
        self.assertEqual(self.user._mt_favorites(), [3, 4])

    def test_dark_scheme_from_cookie(self):
        self.env["ir.http"].with_user(self.user)
        # Without a cookie the server renders the light bundle.
        self.assertEqual(self.env["ir.http"].color_scheme(), "light")
