from odoo import fields, models


class ReportPosSessionClose(models.Model):
    _name = 'report.pos.session.close'
    _description = 'POS Session Closing and Cash Reconciliation'
    _auto = False
    _order = 'stop_at desc, id desc'

    name = fields.Char(string='Session', readonly=True)
    config_id = fields.Many2one('pos.config', string='Point of Sale', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    currency_id = fields.Many2one('res.currency', string='Currency', readonly=True)
    cashier_id = fields.Many2one('res.users', string='Cashier', readonly=True)
    state = fields.Selection(
        [('opening_control', 'Opening'), ('opened', 'Opened'),
         ('closing_control', 'Closing'), ('closed', 'Closed')],
        string='Status', readonly=True)
    start_at = fields.Datetime(string='Opened', readonly=True)
    stop_at = fields.Datetime(string='Closed', readonly=True)
    order_count = fields.Integer(string='Orders', readonly=True)
    total_sales = fields.Monetary(string='Sales', readonly=True)
    opening_cash = fields.Monetary(string='Opening Cash', readonly=True)
    cash_sales = fields.Monetary(string='Cash Sales', readonly=True)
    other_sales = fields.Monetary(string='Card / bKash Sales', readonly=True)
    cash_in = fields.Monetary(string='Cash In', readonly=True)
    cash_out = fields.Monetary(string='Cash Out', readonly=True)
    expected_cash = fields.Monetary(string='Expected Cash', readonly=True)
    counted_cash = fields.Monetary(string='Counted Cash', readonly=True)
    difference = fields.Monetary(string='Difference', readonly=True)

    @property
    def _table_query(self):
        return """
            SELECT s.id AS id,
                   s.name,
                   s.config_id,
                   pc.company_id,
                   pc.currency_id,
                   s.user_id AS cashier_id,
                   s.state,
                   s.start_at,
                   s.stop_at,
                   COALESCE(sales.order_count, 0)::integer AS order_count,
                   COALESCE(sales.total_sales, 0) AS total_sales,
                   s.cash_register_balance_start AS opening_cash,
                   COALESCE(pay.cash_sales, 0) AS cash_sales,
                   COALESCE(pay.other_sales, 0) AS other_sales,
                   COALESCE(io.cash_in, 0) AS cash_in,
                   COALESCE(io.cash_out, 0) AS cash_out,
                   s.cash_register_balance_start + COALESCE(pay.cash_sales, 0)
                       + COALESCE(io.net_lines, 0) AS expected_cash,
                   s.cash_register_balance_end_real AS counted_cash,
                   s.cash_register_balance_end_real - (s.cash_register_balance_start
                       + COALESCE(pay.cash_sales, 0) + COALESCE(io.net_lines, 0)) AS difference
              FROM pos_session s
              JOIN pos_config pc ON pc.id = s.config_id
              LEFT JOIN (
                    SELECT p.session_id,
                           sum(CASE WHEN pm.is_cash_count THEN p.amount ELSE 0 END) AS cash_sales,
                           sum(CASE WHEN pm.is_cash_count THEN 0 ELSE p.amount END) AS other_sales
                      FROM pos_payment p
                      JOIN pos_payment_method pm ON pm.id = p.payment_method_id
                     WHERE NOT p.is_change
                     GROUP BY p.session_id
              ) pay ON pay.session_id = s.id
              LEFT JOIN (
                    SELECT sl.pos_session_id,
                           sum(CASE WHEN sl.amount > 0 THEN sl.amount ELSE 0 END) AS cash_in,
                           sum(CASE WHEN sl.amount < 0 THEN -sl.amount ELSE 0 END) AS cash_out,
                           sum(sl.amount) AS net_lines
                      FROM account_bank_statement_line sl
                     WHERE sl.pos_session_id IS NOT NULL
                     GROUP BY sl.pos_session_id
              ) io ON io.pos_session_id = s.id
              LEFT JOIN (
                    SELECT o.session_id,
                           sum(o.amount_total) AS total_sales,
                           count(*) AS order_count
                      FROM pos_order o
                     WHERE o.state IN ('paid', 'done')
                     GROUP BY o.session_id
              ) sales ON sales.session_id = s.id
        """