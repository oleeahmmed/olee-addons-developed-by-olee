from . import models


def pre_init_hook(env):
    # pages that moved here from an older Modern Employees: remove them first (same addresses)
    from odoo.addons.employee_modern.hooks import remove_moved_pages
    remove_moved_pages(env.cr)
