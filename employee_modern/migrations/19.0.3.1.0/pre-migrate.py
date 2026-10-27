from odoo.addons.employee_modern.hooks import remove_moved_pages


def migrate(cr, version):
    remove_moved_pages(cr)
