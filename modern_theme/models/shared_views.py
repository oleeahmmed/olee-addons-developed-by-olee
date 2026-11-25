"""One form per document, shared by every modern app.

Each modern app embeds Odoo's own views in its pages. The documents that several
apps show (quotations / sales orders, products) must open in the *same* form
everywhere, so their view xml ids live here once and the apps reuse them
(``shared_view_ids`` in Python, ``res.users.modern_theme_shared_view_ids`` from JS).
A missing xml id (module not installed) maps to False = the model's default view.
"""
from odoo import api, models

# The one product form: Odoo's own default product.template form (with variants).
PRODUCT_FORM = 'product.product_template_only_form_view'
# The one quotation / sales order form: Odoo's own.
SALE_ORDER_FORM = 'sale.view_order_form'

SALE_ORDER_VIEWS = {
    'kanban': 'sale.view_sale_order_kanban',
    'calendar': 'sale.view_sale_order_calendar',
    'pivot': 'sale.view_sale_order_pivot',
    'graph': 'sale.view_sale_order_graph',
    'activity': 'sale.sale_order_view_activity',
    'form': SALE_ORDER_FORM,
}

SHARED_XMLIDS = {
    'product_form': PRODUCT_FORM,
    'quotation_list': 'sale.view_quotation_tree_with_onboarding',
    'quotation_search': 'sale.sale_order_view_search_inherit_quotation',
    'order_list': 'sale.view_order_tree',
    'order_search': 'sale.sale_order_view_search_inherit_sale',
    **{f'quotation_{t}': x for t, x in SALE_ORDER_VIEWS.items()},
    **{f'order_{t}': x for t, x in SALE_ORDER_VIEWS.items()},
}


def view_ref(env, xmlid):
    record = env.ref(xmlid, raise_if_not_found=False)
    return record.id if record else False


def shared_view_ids(env):
    """{"<prefix>_<type>": view id} of the documents shared between the modern apps."""
    return {key: view_ref(env, xmlid) for key, xmlid in SHARED_XMLIDS.items()}


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model
    def modern_theme_shared_view_ids(self):
        """Shared view ids for the JS pages of modern_theme (js/app_kit/sale_pages.js)."""
        return shared_view_ids(self.env)
