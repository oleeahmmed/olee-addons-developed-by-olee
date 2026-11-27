from odoo import fields, models


class ReportPosStockFlow(models.Model):
    _name = 'report.pos.stock.flow'
    _description = 'POS Fast-Moving vs Dead Stock'
    _auto = False
    _order = 'qty_sold_90 desc, id'

    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    categ_id = fields.Many2one('product.category', string='Category', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    currency_id = fields.Many2one('res.currency', string='Currency', readonly=True)
    status = fields.Selection(
        [('fast', 'Fast moving'), ('slow', 'Slow moving'), ('dead', 'Dead stock')],
        string='Movement', readonly=True)
    on_hand = fields.Float(string='On Hand', readonly=True)
    stock_value = fields.Monetary(string='Stock Value', readonly=True)
    qty_sold_30 = fields.Float(string='Sold (30 days)', readonly=True)
    qty_sold_60 = fields.Float(string='Sold (60 days)', readonly=True)
    qty_sold_90 = fields.Float(string='Sold (90 days)', readonly=True)
    last_sale_date = fields.Datetime(string='Last Sale', readonly=True)
    days_since_last_sale = fields.Integer(string='Days Since Last Sale', readonly=True)

    @property
    def _table_query(self):
        return """
            WITH sales AS (
                SELECT l.product_id,
                       pc.company_id,
                       o.date_order,
                       l.qty
                  FROM pos_order_line l
                  JOIN pos_order o ON o.id = l.order_id
                  JOIN pos_config pc ON pc.id = o.config_id
                 WHERE o.state IN ('paid', 'done')
            ), agg AS (
                SELECT s.product_id,
                       s.company_id,
                       sum(CASE WHEN s.date_order >= now() - interval '30 days' THEN s.qty ELSE 0 END) AS qty_sold_30,
                       sum(CASE WHEN s.date_order >= now() - interval '60 days' THEN s.qty ELSE 0 END) AS qty_sold_60,
                       sum(s.qty) AS qty_sold_90,
                       max(s.date_order) AS last_sale_date
                  FROM sales s
                 WHERE s.date_order >= now() - interval '90 days'
                 GROUP BY 1, 2
            ), stock AS (
                SELECT q.product_id,
                       q.company_id,
                       sum(q.quantity) AS on_hand
                  FROM stock_quant q
                  JOIN stock_location loc ON loc.id = q.location_id
                 WHERE loc.usage = 'internal'
                 GROUP BY 1, 2
            ), keys AS (
                SELECT product_id, company_id FROM agg
                UNION
                SELECT product_id, company_id FROM stock
            )
            SELECT row_number() OVER (ORDER BY k.product_id, k.company_id) AS id,
                   k.product_id,
                   pt.categ_id,
                   k.company_id,
                   c.currency_id,
                   CASE WHEN COALESCE(st.on_hand, 0) > 0 AND COALESCE(a.qty_sold_90, 0) = 0 THEN 'dead'
                        WHEN COALESCE(a.qty_sold_30, 0) = 0 THEN 'slow'
                        ELSE 'fast' END AS status,
                   COALESCE(st.on_hand, 0) AS on_hand,
                   COALESCE(st.on_hand, 0)
                       * COALESCE((pp.standard_price ->> (k.company_id)::text)::numeric, 0) AS stock_value,
                   COALESCE(a.qty_sold_30, 0) AS qty_sold_30,
                   COALESCE(a.qty_sold_60, 0) AS qty_sold_60,
                   COALESCE(a.qty_sold_90, 0) AS qty_sold_90,
                   a.last_sale_date,
                   CASE WHEN a.last_sale_date IS NULL THEN 9999
                        ELSE (current_date - a.last_sale_date::date) END AS days_since_last_sale
              FROM keys k
              JOIN product_product pp ON pp.id = k.product_id
              JOIN product_template pt ON pt.id = pp.product_tmpl_id
              JOIN res_company c ON c.id = k.company_id
              LEFT JOIN agg a ON a.product_id = k.product_id AND a.company_id = k.company_id
              LEFT JOIN stock st ON st.product_id = k.product_id AND st.company_id = k.company_id
             WHERE pp.active
        """