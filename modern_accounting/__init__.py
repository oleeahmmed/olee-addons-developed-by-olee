from . import models


def uninstall_hook(env):
    """Give back Odoo's default: Invoicing administrators no longer get the full
    accounting features implied (users keep the groups they already have)."""
    manager = env.ref('account.group_account_manager', raise_if_not_found=False)
    full = env.ref('account.group_account_user', raise_if_not_found=False)
    if manager and full and full in manager.implied_ids:
        manager.write({'implied_ids': [(3, full.id)]})
