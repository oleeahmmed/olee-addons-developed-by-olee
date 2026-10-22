"""Modern Accounting: the views of its pages and the accountant's dashboard.

Read-only, on Odoo's own account.move.line / account.move / account.journal
(no new table or field). Amounts are in the company currency (Odoo's `balance`)
and every figure respects the user's rights and record rules.
"""
from datetime import timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import PERIODS, growth, month_key, period_bounds
from odoo.tools import date_utils

LIQUIDITY = ('asset_cash', 'liability_credit_card')
RECENT_FIELDS = ['name', 'date', 'ref', 'journal_id', 'partner_id', 'move_type', 'state', 'amount_total_signed', 'currency_id']


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    # ------------------------------------------------------------------
    # Standard views shown in the pages (by xml id; a missing one falls
    # back to the model's default view)
    # ------------------------------------------------------------------
    @api.model
    def modern_accounting_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        line = {
            'list': ref('account.view_move_line_tree'),
            'pivot': ref('account.view_move_line_pivot'),
            'form': ref('account.view_move_line_form'),
            'search': ref('account.view_account_move_line_filter'),
        }
        ids = {
            'entry_list': ref('account.view_move_tree'),
            'entry_kanban': ref('account.view_account_move_kanban'),
            'entry_form': ref('account.view_move_form'),
            'entry_search': ref('account.view_account_move_filter'),
            'payment_list': ref('account.view_account_payment_tree'),
            'payment_kanban': ref('account.view_account_payment_kanban'),
            'payment_form': ref('account.view_account_payment_form'),
            'payment_search': ref('account.view_account_payment_search'),
            'payment_graph': ref('account.view_account_payment_graph'),
            'account_list': ref('account.view_account_list'),
            'account_kanban': ref('account.view_account_account_kanban'),
            'account_form': ref('account.view_account_form'),
            'account_search': ref('account.view_account_search'),
            'gl_list': ref('account.view_move_line_tree_grouped_general'),
            'pl_list': ref('account.view_move_line_tree_grouped_partner'),
            'cash_list': ref('account.view_move_line_tree_grouped_general'),
            'tax_list': ref('account.view_move_line_tax_audit_tree'),
        }
        for prefix in ('item', 'gl', 'pl', 'cash', 'tb', 'pnl', 'bs', 'tax'):
            for view_type, view_id in line.items():
                ids.setdefault(f'{prefix}_{view_type}', view_id)
        return ids

    # ------------------------------------------------------------------
    # Accountant's dashboard
    # ------------------------------------------------------------------
    @api.model
    def modern_accounting_dashboard(self, period='month'):
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        Line = self
        posted = [('parent_state', '=', 'posted')]

        def total(domain):
            [(amount,)] = Line._read_group(posted + domain, aggregates=['balance:sum'])
            return amount or 0.0

        def between(a, b):
            return [('date', '>=', a), ('date', '<', b)]

        income_d = [('account_id.internal_group', '=', 'income')]
        expense_d = [('account_id.internal_group', '=', 'expense')]

        def income(a, b):
            return -total(income_d + between(a, b)) or 0.0  # no -0.0

        def expense(a, b):
            return total(expense_d + between(a, b)) or 0.0

        inc, inc_prev = income(start, end), income(prev_start, prev_end)
        exp, exp_prev = expense(start, end), expense(prev_start, prev_end)
        profit, profit_prev = inc - exp, inc_prev - exp_prev
        up_to_today = [('date', '<=', today)]
        cash = total([('account_id.account_type', 'in', LIQUIDITY)] + up_to_today)
        receivable = total([('account_id.account_type', '=', 'asset_receivable')] + up_to_today)
        payable = -total([('account_id.account_type', '=', 'liability_payable')] + up_to_today) or 0.0
        kpis = {
            'income': inc, 'income_prev': inc_prev, 'income_delta': growth(inc, inc_prev),
            'expense': exp, 'expense_prev': exp_prev, 'expense_delta': growth(exp, exp_prev),
            'profit': profit, 'profit_prev': profit_prev,
            'profit_delta': growth(profit, profit_prev) if profit_prev > 0 else None,
            'margin': round(profit * 100 / inc, 1) if inc else None,
            'cash': cash, 'receivable': receivable, 'payable': payable,
        }

        # ---------- per month ----------
        def monthly(domain, a, b, sign=1):
            return {
                month_key(m): (sign * (amount or 0.0)) or 0.0
                for m, amount in Line._read_group(posted + domain + between(a, b), ['date:month'], ['balance:sum'])
            }

        year_start = date_utils.start_of(today, 'year')
        year_end = year_start + relativedelta(years=1)
        inc_year = monthly(income_d, year_start, year_end, -1)
        inc_last = monthly(income_d, year_start - relativedelta(years=1), year_start, -1)
        exp_year = monthly(expense_d, year_start, year_end)
        months = []
        for i in range(12):
            month = year_start + relativedelta(months=i)
            months.append({
                'label': month.strftime('%b'),
                'value': inc_year.get(month, 0.0),
                'previous': inc_last.get(month - relativedelta(years=1), 0.0),
                'expense': exp_year.get(month, 0.0),
                'future': month > today,
            })
        spark_start = date_utils.start_of(today, 'month') - relativedelta(months=11)
        spark_inc = monthly(income_d, spark_start, end, -1)
        spark_exp = monthly(expense_d, spark_start, end)
        spark_months = [spark_start + relativedelta(months=i) for i in range(12)]
        sparks = {
            'income': [spark_inc.get(m, 0.0) for m in spark_months],
            'expense': [spark_exp.get(m, 0.0) for m in spark_months],
            'profit': [spark_inc.get(m, 0.0) - spark_exp.get(m, 0.0) for m in spark_months],
        }

        # ---------- where the money went: expenses by account ----------
        rows = Line._read_group(posted + expense_d + between(start, end), ['account_id'], ['balance:sum'],
                                order='balance:sum desc')
        expenses = [{'id': a.id, 'label': a.display_name, 'value': amount or 0.0} for a, amount in rows if (amount or 0.0) > 0]
        if len(expenses) > 6:
            other = sum(e['value'] for e in expenses[5:])
            expenses = expenses[:5] + [{'id': 0, 'label': self.env._('Other expenses'), 'value': other}]

        return {
            'currency_id': self.env.company.currency_id.id,
            'lakh': self.env.company.currency_id.name == 'BDT',
            'period': period if period in PERIODS else 'month',
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'end': fields.Date.to_string(end - timedelta(days=1)),
            'today': fields.Date.to_string(today),
            'year': today.year,
            'company': self.env.company.name,
            'kpis': kpis,
            'sparks': sparks,
            'months': months,
            'expenses': expenses,
            'liquidity': self._modern_accounting_liquidity(today),
            'attention': self._modern_accounting_attention(today),
            'recent': self.env['account.move'].search_read(
                [('state', '=', 'posted')], RECENT_FIELDS, order='date desc, id desc', limit=8),
        }

    @api.model
    def _modern_accounting_liquidity(self, today):
        """Balance of each bank / cash / credit card journal's account, as of today."""
        journals = self.env['account.journal'].search(
            [('type', 'in', ('bank', 'cash', 'credit')), ('default_account_id', '!=', False)])
        accounts = journals.default_account_id
        balances = dict(self._read_group(
            [('parent_state', '=', 'posted'), ('account_id', 'in', accounts.ids), ('date', '<=', today)],
            ['account_id'], ['balance:sum']))
        return [{
            'id': journal.id,
            'account_id': journal.default_account_id.id,
            'label': journal.name,
            'type': journal.type,
            'code': journal.default_account_id.code,
            'value': balances.get(journal.default_account_id, 0.0) or 0.0,
        } for journal in journals]

    @api.model
    def _modern_accounting_attention(self, today):
        Move = self.env['account.move']
        open_items = [('parent_state', '=', 'posted'), ('reconciled', '=', False), ('amount_residual', '!=', 0),
                      ('date_maturity', '<', today)]

        def overdue(account_type, sign):
            [(amount, n)] = self._read_group(open_items + [('account_id.account_type', '=', account_type)],
                                             aggregates=['amount_residual:sum', '__count'])
            return (sign * (amount or 0.0)) or 0.0, n

        overdue_in, overdue_in_n = overdue('asset_receivable', 1)
        overdue_out, overdue_out_n = overdue('liability_payable', -1)
        items = [
            {'key': 'draft', 'count': Move.search_count([('state', '=', 'draft')]),
             'tone': 'info', 'icon': 'fa-pencil', 'label': self.env._('Draft entries to post')},
            {'key': 'to_check', 'count': Move.search_count([('state', '=', 'posted'), ('checked', '=', False)]),
             'tone': 'violet', 'icon': 'fa-eye', 'label': self.env._('Entries to review')},
        ]
        StatementLine = self.env['account.bank.statement.line']
        if StatementLine.browse().has_access('read'):
            items.append({'key': 'unmatched', 'count': StatementLine.search_count([('is_reconciled', '=', False)]),
                          'tone': 'warning', 'icon': 'fa-university', 'label': self.env._('Bank transactions to match')})
        items += [
            {'key': 'overdue_in', 'count': overdue_in_n, 'amount': overdue_in,
             'tone': 'danger', 'icon': 'fa-exclamation-circle', 'label': self.env._('Overdue amounts to collect')},
            {'key': 'overdue_out', 'count': overdue_out_n, 'amount': overdue_out,
             'tone': 'danger', 'icon': 'fa-clock-o', 'label': self.env._('Overdue amounts to pay')},
        ]
        return items
