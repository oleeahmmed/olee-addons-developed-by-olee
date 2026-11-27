from odoo import fields, models


class ReportPosDailySummary(models.Model):
    _name = 'report.pos.daily.summary'
    _description = 'POS Daily Business Summary'
    _auto = False
    _order = 'date desc, id desc'

    date = fields.Date(string='Date', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    currency_id = fields.Many2one('res.currency', string='Currency', readonly=True)
    order_count = fields.Integer(string='Orders', readonly=True)
    sales_total = fields.Monetary(string='Sales', readonly=True)
    returns_total = fields.Monetary(string='Returns', readonly=True)
    net_sales = fields.Monetary(string='Net Sales (incl. tax)', readonly=True)
    tax_total = fields.Monetary(string='Tax', readonly=True)
    cost_total = fields.Monetary(string='Cost of Goods', readonly=True)
    gross_profit = fields.Monetary(string='Gross Profit', readonly=True)
    cash_sales = fields.Monetary(string='Cash Sales', readonly=True)
    other_sales = fields.Monetary(string='Card / bKash Sales', readonly=True)
    cash_in = fields.Monetary(string='Cash In', readonly=True)
    cash_out = fields.Monetary(string='Expenses (Cash Out)', readonly=True)
    purchases = fields.Monetary(string='Purchases', readonly=True)
    receivables_collected = fields.Monetary(string='Receivables Collected', readonly=True)
    supplier_payments = fields.Monetary(string='Supplier Payments', readonly=True)
    cash_balance = fields.Monetary(string='Cash in Hand', readonly=True)
    bank_balance = fields.Monetary(string='Bank / bKash Balance', readonly=True)
    net_profit = fields.Monetary(string='Net Profit', readonly=True)

    @property
    def _table_query(self):
        return """
            WITH pos_sales AS (
                SELECT o.company_id,
                       date(o.date_order) AS d,
                       count(*) AS order_count,
                       sum(o.amount_total) AS net_sales,
                       sum(o.amount_tax) AS tax_total,
                       sum(CASE WHEN o.amount_total > 0 THEN o.amount_total ELSE 0 END) AS sales_total,
                       sum(CASE WHEN o.amount_total < 0 THEN -o.amount_total ELSE 0 END) AS returns_total
                  FROM pos_order o
                 WHERE o.state IN ('paid', 'done')
                 GROUP BY 1, 2
            ), pos_cost AS (
                SELECT o.company_id,
                       date(o.date_order) AS d,
                       sum(COALESCE(NULLIF(l.total_cost, 0),
                           COALESCE((pp.standard_price ->> (o.company_id)::text)::numeric, 0) * l.qty)) AS cost_total
                  FROM pos_order_line l
                  JOIN pos_order o ON o.id = l.order_id
                  JOIN product_product pp ON pp.id = l.product_id
                 WHERE o.state IN ('paid', 'done')
                 GROUP BY 1, 2
            ), pos_pay AS (
                SELECT o.company_id,
                       date(o.date_order) AS d,
                       sum(CASE WHEN pm.is_cash_count THEN p.amount ELSE 0 END) AS cash_sales,
                       sum(CASE WHEN pm.is_cash_count THEN 0 ELSE p.amount END) AS other_sales
                  FROM pos_payment p
                  JOIN pos_order o ON o.id = p.pos_order_id
                  JOIN pos_payment_method pm ON pm.id = p.payment_method_id
                 WHERE o.state IN ('paid', 'done') AND NOT p.is_change
                 GROUP BY 1, 2
            ), cash_io AS (
                SELECT pc.company_id,
                       am.date AS d,
                       sum(CASE WHEN sl.amount > 0 THEN sl.amount ELSE 0 END) AS cash_in,
                       sum(CASE WHEN sl.amount < 0 THEN -sl.amount ELSE 0 END) AS cash_out
                  FROM account_bank_statement_line sl
                  JOIN account_move am ON am.id = sl.move_id
                  JOIN pos_session s ON s.id = sl.pos_session_id
                  JOIN pos_config pc ON pc.id = s.config_id
                 GROUP BY 1, 2
            ), purchases AS (
                SELECT po.company_id,
                       date(po.date_order) AS d,
                       sum(po.amount_total) AS purchases
                  FROM purchase_order po
                 WHERE po.state IN ('purchase', 'done')
                 GROUP BY 1, 2
            ), partner_pay AS (
                SELECT ap.company_id,
                       ap.date AS d,
                       sum(CASE WHEN ap.payment_type = 'inbound' THEN ap.amount ELSE 0 END) AS receivables_collected,
                       sum(CASE WHEN ap.payment_type = 'outbound' THEN ap.amount ELSE 0 END) AS supplier_payments
                  FROM account_payment ap
                 WHERE ap.state IN ('in_process', 'paid') AND ap.pos_session_id IS NULL
                 GROUP BY 1, 2
            ), journal_day AS (
                SELECT aml.company_id,
                       am.date AS d,
                       sum(CASE WHEN j.type = 'cash' THEN aml.balance ELSE 0 END) AS cash_move,
                       sum(CASE WHEN j.type = 'bank' THEN aml.balance ELSE 0 END) AS bank_move
                  FROM account_move_line aml
                  JOIN account_move am ON am.id = aml.move_id
                  JOIN account_journal j ON j.id = aml.journal_id
                 WHERE am.state = 'posted' AND j.type IN ('cash', 'bank')
                 GROUP BY 1, 2
            ), journal_bal AS (
                SELECT jd.company_id,
                       jd.d,
                       sum(jd.cash_move) OVER (PARTITION BY jd.company_id ORDER BY jd.d)
                           AS cash_balance,
                       sum(jd.bank_move) OVER (PARTITION BY jd.company_id ORDER BY jd.d)
                           AS bank_balance
                  FROM journal_day jd
            ), session_cash AS (
                SELECT s.id,
                       pc.company_id,
                       date(COALESCE(s.stop_at, s.start_at)) AS d,
                       s.stop_at,
                       s.state,
                       s.cash_register_balance_end_real AS counted,
                       s.cash_register_balance_start
                           + COALESCE(pay.cash_sales, 0) + COALESCE(io.net_lines, 0) AS expected
                  FROM pos_session s
                  JOIN pos_config pc ON pc.id = s.config_id
                  LEFT JOIN (
                        SELECT p.session_id,
                               sum(CASE WHEN pm.is_cash_count THEN p.amount ELSE 0 END) AS cash_sales
                          FROM pos_payment p
                          JOIN pos_payment_method pm ON pm.id = p.payment_method_id
                         WHERE NOT p.is_change
                         GROUP BY p.session_id
                  ) pay ON pay.session_id = s.id
                  LEFT JOIN (
                        SELECT sl.pos_session_id, sum(sl.amount) AS net_lines
                          FROM account_bank_statement_line sl
                         WHERE sl.pos_session_id IS NOT NULL
                         GROUP BY sl.pos_session_id
                  ) io ON io.pos_session_id = s.id
            ), drawer AS (
                SELECT DISTINCT ON (sc.company_id, sc.d)
                       sc.company_id,
                       sc.d,
                       CASE WHEN sc.state = 'closed' THEN sc.counted ELSE sc.expected END AS cash_hand
                  FROM session_cash sc
                 ORDER BY sc.company_id, sc.d, sc.stop_at DESC NULLS LAST, sc.id DESC
            ), days AS (
                SELECT company_id, d FROM pos_sales
                UNION SELECT company_id, d FROM purchases
                UNION SELECT company_id, d FROM partner_pay
                UNION SELECT company_id, d FROM journal_bal
                UNION SELECT company_id, d FROM drawer
            )
            SELECT row_number() OVER (ORDER BY dy.d, dy.company_id) AS id,
                   dy.d AS date,
                   dy.company_id,
                   c.currency_id,
                   COALESCE(ps.order_count, 0)::integer AS order_count,
                   COALESCE(ps.sales_total, 0) AS sales_total,
                   COALESCE(ps.returns_total, 0) AS returns_total,
                   COALESCE(ps.net_sales, 0) AS net_sales,
                   COALESCE(ps.tax_total, 0) AS tax_total,
                   COALESCE(pc2.cost_total, 0) AS cost_total,
                   COALESCE(ps.net_sales, 0) - COALESCE(ps.tax_total, 0) - COALESCE(pc2.cost_total, 0)
                       AS gross_profit,
                   COALESCE(pp2.cash_sales, 0) AS cash_sales,
                   COALESCE(pp2.other_sales, 0) AS other_sales,
                   COALESCE(io.cash_in, 0) AS cash_in,
                   COALESCE(io.cash_out, 0) AS cash_out,
                   COALESCE(pu.purchases, 0) AS purchases,
                   COALESCE(pay.receivables_collected, 0) AS receivables_collected,
                   COALESCE(pay.supplier_payments, 0) AS supplier_payments,
                   COALESCE(dw.cash_hand, jb.cash_balance, 0) AS cash_balance,
                   COALESCE(jb.bank_balance, 0) AS bank_balance,
                   COALESCE(ps.net_sales, 0) - COALESCE(ps.tax_total, 0) - COALESCE(pc2.cost_total, 0)
                       - COALESCE(io.cash_out, 0) AS net_profit
              FROM days dy
              JOIN res_company c ON c.id = dy.company_id
              LEFT JOIN pos_sales ps ON ps.company_id = dy.company_id AND ps.d = dy.d
              LEFT JOIN pos_cost pc2 ON pc2.company_id = dy.company_id AND pc2.d = dy.d
              LEFT JOIN pos_pay pp2 ON pp2.company_id = dy.company_id AND pp2.d = dy.d
              LEFT JOIN cash_io io ON io.company_id = dy.company_id AND io.d = dy.d
              LEFT JOIN purchases pu ON pu.company_id = dy.company_id AND pu.d = dy.d
              LEFT JOIN partner_pay pay ON pay.company_id = dy.company_id AND pay.d = dy.d
              LEFT JOIN journal_bal jb ON jb.company_id = dy.company_id AND jb.d = dy.d
              LEFT JOIN drawer dw ON dw.company_id = dy.company_id AND dw.d = dy.d
        """