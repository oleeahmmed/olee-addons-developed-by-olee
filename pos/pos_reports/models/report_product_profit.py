from odoo import fields, models


class ReportPosProductProfit(models.Model):
    _name = 'report.pos.product.profit'
    _description = 'POS Product-wise Profit'
    _auto = False
    _order = 'date_order desc, id desc'

    date_order = fields.Datetime(string='Date', readonly=True)
    date = fields.Date(string='Day', readonly=True)
    order_name = fields.Char(string='Order', readonly=True)
    config_id = fields.Many2one('pos.config', string='Point of Sale', readonly=True)
    session_id = fields.Many2one('pos.session', string='Session', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    currency_id = fields.Many2one('res.currency', string='Currency', readonly=True)
    partner_id = fields.Many2one('res.partner', string='Customer', readonly=True)
    cashier_id = fields.Many2one('res.users', string='Cashier', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    categ_id = fields.Many2one('product.category', string='Category', readonly=True)
    qty = fields.Float(string='Qty', readonly=True)
    price_unit = fields.Monetary(string='Unit Price', readonly=True)
    discount = fields.Float(string='Discount (%)', readonly=True)
    gross_amount = fields.Monetary(string='Gross', readonly=True)
    net_sales = fields.Monetary(string='Net Sales', readonly=True)
    total_with_tax = fields.Monetary(string='Total (incl. tax)', readonly=True)
    cost = fields.Monetary(string='Cost', readonly=True)
    profit = fields.Monetary(string='Profit', readonly=True)
    margin = fields.Float(string='Margin (%)', readonly=True, digits=(12, 2))

    @property
    def _table_query(self):
        return """
            SELECT l.id AS id,
                   o.date_order AS date_order,
                   date(o.date_order) AS date,
                   o.name AS order_name,
                   o.config_id,
                   o.session_id,
                   pc.company_id,
                   pc.currency_id,
                   o.partner_id,
                   o.user_id AS cashier_id,
                   l.product_id,
                   pt.categ_id,
                   l.qty,
                   l.price_unit,
                   l.discount,
                   (l.price_unit * l.qty) AS gross_amount,
                   l.price_subtotal AS net_sales,
                   l.price_subtotal_incl AS total_with_tax,
                   COALESCE(NULLIF(l.total_cost, 0),
                       COALESCE((pp.standard_price ->> (pc.company_id)::text)::numeric, 0) * l.qty)
                       AS cost,
                   l.price_subtotal - COALESCE(NULLIF(l.total_cost, 0),
                       COALESCE((pp.standard_price ->> (pc.company_id)::text)::numeric, 0) * l.qty)
                       AS profit,
                   CASE WHEN l.price_subtotal <> 0
                       THEN round((l.price_subtotal - COALESCE(NULLIF(l.total_cost, 0),
                           COALESCE((pp.standard_price ->> (pc.company_id)::text)::numeric, 0) * l.qty))
                           * 100.0 / l.price_subtotal, 2)
                       ELSE 0 END AS margin
              FROM pos_order_line l
              JOIN pos_order o ON o.id = l.order_id
              JOIN pos_config pc ON pc.id = o.config_id
              JOIN product_product pp ON pp.id = l.product_id
              JOIN product_template pt ON pt.id = pp.product_tmpl_id
             WHERE o.state IN ('paid', 'done')
        """