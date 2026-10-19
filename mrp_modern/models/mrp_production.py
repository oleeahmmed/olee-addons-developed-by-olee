from odoo import api, models


class MrpProduction(models.Model):
    _inherit = 'mrp.production'

    @api.model
    def mrp_modern_view_ids(self):
        """Xml ids of the standard views the modern pages embed (missing → default)."""
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        mo_views = {
            'kanban': ref('mrp.mrp_production_kanban_view'),
            'calendar': ref('mrp.view_production_calendar'),
            'pivot': ref('mrp.view_production_pivot'),
            'graph': ref('mrp.view_production_graph'),
            'activity': ref('mrp.mrp_production_view_activity'),
            'form': ref('mrp.mrp_production_form_view'),
            'search': ref('mrp.view_mrp_production_filter'),
            'list': ref('mrp.mrp_production_tree_view'),
        }
        ids = {}
        for prefix in ('mo', 'todo', 'done'):
            for view_type, view_id in mo_views.items():
                ids[f'{prefix}_{view_type}'] = view_id
        ids.update({
            'bom_list': ref('mrp.mrp_bom_tree_view'),
            'bom_kanban': ref('mrp.mrp_bom_kanban_view'),
            'bom_form': ref('mrp.mrp_bom_form_view'),
            'bom_search': ref('mrp.view_mrp_bom_filter'),
            'unbuild_list': ref('mrp.mrp_unbuild_tree_view'),
            'unbuild_kanban': ref('mrp.mrp_unbuild_kanban_view'),
            'unbuild_form': ref('mrp.mrp_unbuild_form_view'),
            'unbuild_search': ref('mrp.mrp_unbuild_search_view'),
            'wo_list': ref('mrp.mrp_production_workorder_tree_view'),
            'wo_form': ref('mrp.mrp_production_workorder_form_view_inherit'),
            'wo_search': ref('mrp.view_mrp_production_workorder_form_view_filter'),
            'wc_list': ref('mrp.mrp_workcenter_tree_view'),
            'wc_kanban': ref('mrp.mrp_workcenter_kanban'),
            'wc_form': ref('mrp.mrp_workcenter_view'),
            'wc_search': ref('mrp.view_mrp_workcenter_search'),
            'product_list': ref('product.product_template_tree_view'),
            'product_kanban': ref('product.product_template_kanban_view'),
            'product_search': ref('mrp.mrp_product_template_search_view') or ref('product.product_template_search_view'),
            'product_form': ref('product.product_template_form_view'),
        })
        return ids
