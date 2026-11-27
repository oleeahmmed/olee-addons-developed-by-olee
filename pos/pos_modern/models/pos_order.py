"""Modern POS: view ids of the pages.

Read-only, on Odoo's own pos.config / pos.session / pos.order / pos.payment (no new table
or field). Every figure is read with the user's own rights, record rules and allowed
companies. Amounts are in the company currency, as in Odoo's own POS reporting.
"""
from odoo import api, models
from odoo.addons.modern_theme.models.shared_views import PRODUCT_FORM


class PosOrder(models.Model):
    _inherit = 'pos.order'

    # ------------------------------------------------------------------
    # Views of the pages (by xml id; a missing one falls back to the model's
    # default view, so an Odoo update cannot break a page)
    # ------------------------------------------------------------------
    @api.model
    def pos_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        order = {
            'list': ref('point_of_sale.view_pos_order_tree'),
            'kanban': ref('pos_modern.order_kanban'),
            'form': ref('point_of_sale.view_pos_pos_form'),
            'search': ref('point_of_sale.view_pos_order_filter'),
            'pivot': ref('point_of_sale.view_pos_order_pivot'),
        }
        ids = {}
        for prefix in ('order', 'refund', 'ongoing'):
            for view_type, view_id in order.items():
                ids[f'{prefix}_{view_type}'] = view_id
        ids.update({
            'shop_kanban': ref('pos_modern.shop_kanban'),
            'shop_list': ref('point_of_sale.view_pos_config_tree'),
            'shop_form': ref('point_of_sale.pos_config_view_form'),
            'shop_search': ref('point_of_sale.view_pos_config_search'),
            'session_list': ref('point_of_sale.view_pos_session_tree'),
            'session_kanban': ref('point_of_sale.view_pos_session_kanban'),
            'session_form': ref('point_of_sale.view_pos_session_form'),
            'session_search': ref('point_of_sale.view_pos_session_search'),
            'payment_list': ref('point_of_sale.view_pos_payment_tree'),
            'payment_form': ref('point_of_sale.view_pos_payment_form'),
            'payment_search': ref('point_of_sale.view_pos_payment_search'),
            'product_kanban': ref('product.product_template_kanban_view'),
            'product_list': ref('point_of_sale.product_template_tree_view_point_of_sale'),
            'product_form': ref(PRODUCT_FORM),
            'product_search': ref('product.product_template_search_view'),
            'customer_kanban': ref('base.res_partner_kanban_view'),
            'customer_list': ref('base.view_partner_tree'),
            'customer_form': ref('base.view_partner_form'),
            'customer_search': ref('base.view_res_partner_filter'),
            'category_list': ref('pos_modern.category_list'),
            'category_kanban': ref('point_of_sale.view_pos_category_kanban'),
            'category_form': ref('point_of_sale.product_pos_category_form_view'),
        })
        return ids
