"""Customer Modern: standard views for the pages of the Contacts app.

Read-only, on Odoo's own res.partner (no new table or field).
"""
from odoo import api, models

LIST_FIELDS = ['name', 'display_name', 'is_company', 'parent_id', 'email', 'phone', 'country_id',
               'city', 'create_date', 'user_id']


class ResPartner(models.Model):
    _inherit = 'res.partner'

    # ------------------------------------------------------------------
    # Standard views shown in the pages (by xml id; a missing one falls
    # back to the model's default view)
    # ------------------------------------------------------------------
    @api.model
    def customer_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        views = {
            'list': ref('base.view_partner_tree'),
            'kanban': ref('base.res_partner_kanban_view'),
            'form': ref('base.view_partner_form'),
            'search': ref('base.view_res_partner_filter'),
            'activity': ref('mail.mail_activity_view_partner') or False,
        }
        ids = {}
        for prefix in ('contact', 'company', 'person', 'customer', 'vendor'):
            for view_type, view_id in views.items():
                ids[f'{prefix}_{view_type}'] = view_id
        return ids
