"""Modern Invoicing: the views of the accounting pages.

Read-only helpers on Odoo's own account.move.line (no new table or field).
"""
from odoo import api, models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    @api.model
    def invoice_modern_acct_view_ids(self):
        """Standard views shown in the accounting pages (by xml id; a missing one
        falls back to the model's default view)."""
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        line = {
            'list': ref('account.view_move_line_tree'),
            'pivot': ref('account.view_move_line_pivot'),
            'form': ref('account.view_move_line_form'),
            'search': ref('account.view_account_move_line_filter'),
        }
        ids = {
            'entry_list': ref('account.view_move_tree'),
            'entry_kanban': ref('account.view_account_move_kanban'),
            'entry_form': ref('account.view_move_form'),
            'entry_search': ref('account.view_account_move_filter'),
            'payment_list': ref('account.view_account_payment_tree'),
            'payment_kanban': ref('account.view_account_payment_kanban'),
            'payment_form': ref('account.view_account_payment_form'),
            'payment_search': ref('account.view_account_payment_search'),
            'payment_graph': ref('account.view_account_payment_graph'),
            'account_list': ref('account.view_account_list'),
            'account_kanban': ref('account.view_account_account_kanban'),
            'account_form': ref('account.view_account_form'),
            'account_search': ref('account.view_account_search'),
            'gl_list': ref('account.view_move_line_tree_grouped_general'),
            'pl_list': ref('account.view_move_line_tree_grouped_partner'),
            'cash_list': ref('account.view_move_line_tree_grouped_general'),
            'tax_list': ref('account.view_move_line_tax_audit_tree'),
        }
        for prefix in ('item', 'gl', 'pl', 'cash', 'tb', 'pnl', 'bs', 'tax'):
            for view_type, view_id in line.items():
                ids.setdefault(f'{prefix}_{view_type}', view_id)
        return ids
