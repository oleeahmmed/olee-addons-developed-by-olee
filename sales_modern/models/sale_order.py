from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.tools import date_utils

QUOTATION_STATES = ('draft', 'sent')
ORDER_FIELDS = [
    'name', 'state', 'partner_id', 'user_id', 'date_order', 'validity_date', 'amount_untaxed',
    'amount_total', 'currency_id', 'invoice_status',
]


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    # ------------------------------------------------------------------
    # Dashboard (read-only; runs with the user's rights, so record rules
    # such as "own documents only" apply exactly as in Odoo's Sales app)
    # ------------------------------------------------------------------

    @api.model
    def sales_modern_dashboard(self):
        Report = self.env['sale.report']
        today = fields.Date.context_today(self)
        month_start = date_utils.start_of(today, 'month')
        trend_start = month_start - relativedelta(months=5)
        since_90 = today - relativedelta(days=90)

        def one(model, domain, aggregates):
            return model._read_group(domain, aggregates=aggregates)[0]

        # amounts come from sale.report: already converted to the company currency
        open_count, = one(self, [('state', 'in', QUOTATION_STATES)], ['__count'])
        open_amount, = one(Report, [('state', 'in', QUOTATION_STATES)], ['price_subtotal:sum'])
        month_count, = one(self, [('state', '=', 'sale'), ('date_order', '>=', month_start)], ['__count'])
        month_amount, = one(Report, [('state', '=', 'sale'), ('date', '>=', month_start)], ['price_subtotal:sum'])
        invoice_count, = one(self, [('invoice_status', '=', 'to invoice')], ['__count'])
        invoice_amount, = one(Report, [('state', '=', 'sale')], ['untaxed_amount_to_invoice:sum'])

        quoted, = one(self, [('create_date', '>=', since_90)], ['__count'])
        won, = one(self, [('create_date', '>=', since_90), ('state', '=', 'sale')], ['__count'])

        by_month = {
            (month.date() if hasattr(month, 'date') else month): amount or 0.0
            for month, amount in Report._read_group(
                [('state', '=', 'sale'), ('date', '>=', trend_start)], ['date:month'], ['price_subtotal:sum'])
        }
        trend = []
        for i in range(6):
            month = trend_start + relativedelta(months=i)
            trend.append({'label': month.strftime('%b'), 'value': by_month.get(month, 0.0)})

        year_start = date_utils.start_of(today, 'year')
        top_products = [
            {'id': product.id, 'label': product.display_name, 'value': amount or 0.0, 'qty': qty or 0.0}
            for product, amount, qty in Report._read_group(
                [('state', '=', 'sale'), ('date', '>=', year_start), ('product_id', '!=', False)],
                ['product_id'], ['price_subtotal:sum', 'product_uom_qty:sum'],
                order='price_subtotal:sum desc', limit=5)
        ]
        top_customers = [
            {'id': partner.id, 'label': partner.display_name, 'value': amount or 0.0}
            for partner, amount in Report._read_group(
                [('state', '=', 'sale'), ('date', '>=', year_start), ('partner_id', '!=', False)],
                ['partner_id'], ['price_subtotal:sum'], order='price_subtotal:sum desc', limit=5)
        ]
        follow_up = self.search_read(
            [('state', '=', 'sent')], ORDER_FIELDS, order='date_order asc', limit=6)
        to_invoice = self.search_read(
            [('invoice_status', '=', 'to invoice')], ORDER_FIELDS, order='date_order asc', limit=6)

        return {
            'currency_id': self.env.company.currency_id.id,
            'kpis': {
                'open_count': open_count, 'open_amount': open_amount or 0.0,
                'month_count': month_count, 'month_amount': month_amount or 0.0,
                'avg_order': (month_amount or 0.0) / month_count if month_count else 0.0,
                'invoice_count': invoice_count, 'invoice_amount': invoice_amount or 0.0,
                'conversion': round(won * 100 / quoted) if quoted else 0,
            },
            'trend': trend,
            'top_products': top_products,
            'top_customers': top_customers,
            'follow_up': follow_up,
            'to_invoice': to_invoice,
            'today': fields.Date.to_string(today),
        }

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
