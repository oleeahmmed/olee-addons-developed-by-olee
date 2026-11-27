"""Modern Invoicing: view ids of the pages of the Invoicing app.

Read-only, on Odoo's own account.move / account.payment (no new table or field).
"""
from odoo import api, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    # ------------------------------------------------------------------
    # Standard views shown in the pages (by xml id; a missing one falls
    # back to the model's default view)
    # ------------------------------------------------------------------
    @api.model
    def invoice_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        move = {
            'kanban': ref('account.view_account_move_kanban'),
            'form': ref('account.view_move_form'),
        }
        ids = {
            'invoice_list': ref('account.view_out_invoice_tree'),
            'invoice_search': ref('account.view_account_invoice_filter'),
            'credit_list': ref('account.view_out_credit_note_tree'),
            'credit_search': ref('account.view_account_invoice_filter'),
            'bill_list': ref('account.view_in_invoice_bill_tree'),
            'bill_search': ref('account.view_account_bill_filter'),
            'refund_list': ref('account.view_in_invoice_refund_tree'),
            'refund_search': ref('account.view_account_bill_filter'),
            'payin_list': ref('account.view_account_payment_tree'),
            'payout_list': ref('account.view_account_supplier_payment_tree'),
        }
        for prefix in ('invoice', 'credit', 'bill', 'refund'):
            for view_type, view_id in move.items():
                ids.setdefault(f'{prefix}_{view_type}', view_id)
        payment = {
            'kanban': ref('account.view_account_payment_kanban'),
            'form': ref('account.view_account_payment_form'),
            'search': ref('account.view_account_payment_search'),
            'graph': ref('account.view_account_payment_graph'),
        }
        for prefix in ('payin', 'payout'):
            for view_type, view_id in payment.items():
                ids.setdefault(f'{prefix}_{view_type}', view_id)
        return ids
