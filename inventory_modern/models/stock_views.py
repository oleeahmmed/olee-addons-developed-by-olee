"""Inventory Modern: the standard views the pages embed.

Read-only, with the user's own rights, from Odoo's standard models only.
No stored data of its own.
"""
from odoo import api, models
from odoo.addons.modern_theme.models.shared_views import PRODUCT_FORM


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    # ------------------------------------------------------------------
    # Standard views embedded in the pages (resolved by xml id; a missing
    # one falls back to the model's default view instead of breaking)
    # ------------------------------------------------------------------
    @api.model
    def inventory_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        picking = {
            'list': ref('stock.vpicktree'),
            'kanban': ref('stock.stock_picking_kanban'),
            'calendar': ref('stock.stock_picking_calendar'),
            'activity': ref('stock.stock_picking_view_activity'),
            'form': ref('stock.view_picking_form'),
            'search': ref('stock.view_picking_internal_search'),
        }
        ids = {
            'product_kanban': ref('stock.product_template_kanban_stock_view'),
            'product_list': ref('stock.view_stock_product_template_tree'),
            'product_search': ref('stock.product_template_search_form_view_stock'),
            'product_form': ref(PRODUCT_FORM),
            'quant_list': ref('stock.view_stock_quant_tree'),
            'quant_pivot': ref('stock.view_stock_quant_pivot'),
            'quant_search': ref('stock.quant_search_view'),
            'moveline_list': ref('stock.view_move_line_tree'),
            'moveline_kanban': ref('stock.view_stock_move_line_kanban'),
            'moveline_pivot': ref('stock.view_stock_move_line_pivot'),
            'moveline_search': ref('stock.stock_move_line_view_search'),
            'moveline_form': ref('stock.view_move_line_form'),
        }
        for prefix in ('receipt', 'delivery', 'internal'):
            for view_type, view_id in picking.items():
                ids[f'{prefix}_{view_type}'] = view_id
        return ids
