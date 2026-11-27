"""Modern Theme has one fixed shadcn look now.

Older versions offered theme options (colour mode, presets, per-app accents) with
their own Settings block. That view referenced fields the model no longer has, and
any inherited Settings view fails to validate while it stays in the database.
"""

from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    if not version:
        return
    env = api.Environment(cr, SUPERUSER_ID, {})
    record = env.ref('modern_theme.res_config_settings_view_form', raise_if_not_found=False)
    if record:
        record.unlink()
