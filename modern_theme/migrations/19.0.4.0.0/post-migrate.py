"""4.0: the Once UI look (neutral greys, emerald brand, contrast buttons) becomes the theme.

Companies switch to the new "once" preset and personal colour overrides are cleared,
so every user gets the new look; anyone can still pick another colour afterwards.
"""

from odoo import SUPERUSER_ID, api


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    env["res.company"].with_context(active_test=False).search([]).write({"mt_preset": "once"})
    cr.execute("UPDATE res_users SET mt_preset = NULL WHERE mt_preset IS NOT NULL")
