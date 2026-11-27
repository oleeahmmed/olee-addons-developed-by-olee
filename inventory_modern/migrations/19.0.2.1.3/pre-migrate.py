"""Remove the home hub action: the app opens on its records, no dashboard page."""

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
