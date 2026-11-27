"""Inventory Modern opens on its records: the old home dashboard is gone.

Delete the client action older versions left in the database, so no upgrade keeps
an action whose page no longer exists.
"""

from odoo import api, SUPERUSER_ID

PATH = 'modern-inventory-home'


def migrate(cr, version):
    if not version:
        return
    env = api.Environment(cr, SUPERUSER_ID, {})
    action = env['ir.actions.client'].search([('path', '=', PATH)])
    if action:
        env['ir.model.data'].search([
            ('model', '=', 'ir.actions.client'),
            ('res_id', 'in', action.ids),
        ]).unlink()
        action.unlink()
