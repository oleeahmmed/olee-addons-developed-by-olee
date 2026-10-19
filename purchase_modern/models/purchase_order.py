from odoo import api, models


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    # ------------------------------------------------------------------
    # Standard views embedded in the pages (resolved by xml id, never by
    # name; a missing one just falls back to the model's default view)
    # ------------------------------------------------------------------

    @api.model
    def purchase_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        order_views = {
            'kanban': ref('purchase.purchase_order_view_kanban_without_dashboard'),
            'activity': ref('purchase.purchase_order_view_activity'),
            'form': ref('purchase.purchase_order_form'),
        }
        ids = {
            'rfq_list': ref('purchase.purchase_order_kpis_tree'),
            'rfq_search': ref('purchase.view_purchase_order_filter'),
            'order_list': ref('purchase.purchase_order_view_tree'),
            'order_search': ref('purchase.purchase_order_view_search'),
            'bill_list': ref('purchase.purchase_order_view_tree'),
            'bill_search': ref('purchase.view_purchase_order_filter'),
            'vendor_list': ref('base.view_partner_tree'),
            'vendor_kanban': ref('base.res_partner_kanban_view'),
            'vendor_search': ref('base.view_res_partner_filter'),
            'vendor_form': ref('base.view_partner_form'),
            'product_list': ref('account.product_template_list_view_purchasable_inherit') or ref('product.product_template_tree_view'),
            'product_kanban': ref('product.product_template_kanban_view'),
            'product_search': ref('product.product_template_search_view'),
            'product_form': ref('product.product_template_form_view'),
        }
        for prefix in ('rfq', 'order', 'bill'):
            for view_type, view_id in order_views.items():
                ids.setdefault(f'{prefix}_{view_type}', view_id)
        return ids
