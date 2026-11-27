"""Remove what the merged modern_accounting module left in the database.

The accounting pages moved into invoice_modern long ago, but databases still hold
the old menus, root app and client actions. One action also owns the path
"modern-accounting-entries", which invoice_modern now needs, so the upgrade stops
on the unique path until they are gone.
"""

from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    if not version:
        return
    env = api.Environment(cr, SUPERUSER_ID, {})
    Data = env['ir.model.data']

    actions = env['ir.actions.client'].search([('tag', '=like', 'modern_accounting.%')])
    if actions:
        Data.search([('model', '=', 'ir.actions.client'), ('res_id', 'in', actions.ids)]).unlink()
        actions.unlink()

    menu_data = Data.search([('module', '=', 'modern_accounting'), ('model', '=', 'ir.ui.menu')])
    menus = env['ir.ui.menu'].with_context(active_test=False).browse(menu_data.mapped('res_id')).exists()
    if menus:
        Data.search([('model', '=', 'ir.ui.menu'), ('res_id', 'in', menus.ids)]).unlink()
        menus.unlink()
