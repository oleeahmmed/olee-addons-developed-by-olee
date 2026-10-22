from odoo import api, models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    # ------------------------------------------------------------------
    # Standard views embedded in the pages (resolved by xml id, never by
    # name; a missing one just falls back to the model's default view)
    # ------------------------------------------------------------------

    @api.model
    def sales_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        order_views = {
            'kanban': ref('sale.view_sale_order_kanban'),
            'calendar': ref('sale.view_sale_order_calendar'),
            'pivot': ref('sale.view_sale_order_pivot'),
            'graph': ref('sale.view_sale_order_graph'),
            'activity': ref('sale.sale_order_view_activity'),
            'form': ref('sale.view_order_form'),
        }
        ids = {
            'quotation_list': ref('sale.view_quotation_tree_with_onboarding'),
            'quotation_search': ref('sale.sale_order_view_search_inherit_quotation'),
            'order_list': ref('sale.view_order_tree'),
            'order_search': ref('sale.sale_order_view_search_inherit_sale'),
            'invoice_list': ref('sale.view_order_tree'),
            'invoice_search': ref('sale.view_sales_order_filter'),
            'customer_list': ref('base.view_partner_tree'),
            'customer_kanban': ref('base.res_partner_kanban_view'),
            'customer_search': ref('base.view_res_partner_filter'),
            'customer_form': ref('base.view_partner_form'),
            'team_list': ref('sales_team.crm_team_view_tree'),
            'team_kanban': ref('sales_modern.crm_team_kanban_sales_modern') or ref('sales_team.crm_team_view_kanban'),
            'team_search': ref('sales_team.crm_team_view_search'),
            'team_form': ref('sales_team.crm_team_view_form'),
            'member_list': ref('sales_team.crm_team_member_view_tree'),
            'member_kanban': ref('sales_team.crm_team_member_view_kanban'),
            'member_search': ref('sales_team.crm_team_member_view_search'),
            'member_form': ref('sales_team.crm_team_member_view_form'),
            'product_list': ref('product.product_template_tree_view'),
            'product_kanban': ref('product.product_template_kanban_view'),
            'product_search': ref('product.product_template_search_view'),
            'product_form': ref('product.product_template_form_view'),
        }
        for prefix in ('quotation', 'order', 'invoice'):
            for view_type, view_id in order_views.items():
                ids[f'{prefix}_{view_type}'] = view_id
        return ids
