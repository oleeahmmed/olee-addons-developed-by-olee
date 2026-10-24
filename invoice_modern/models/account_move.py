"""Modern Invoicing: views and the owner dashboard of the Invoicing app.

Read-only, on Odoo's own account.move / account.payment (no new table or field).
Amounts are in the company currency (Odoo's *_signed fields) and every figure
respects the user's rights and record rules.
"""
from datetime import timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import PERIODS, growth, month_key, period_bounds
from odoo.tools import date_utils

OUT_TYPES = ('out_invoice', 'out_refund')
IN_TYPES = ('in_invoice', 'in_refund')
OPEN = ('not_paid', 'partial')
LIST_FIELDS = ['name', 'move_type', 'partner_id', 'invoice_date', 'invoice_date_due', 'state', 'payment_state',
               'amount_untaxed', 'amount_total', 'amount_residual', 'currency_id', 'is_move_sent']
AGEING = (('Not due', None, 0), ('1–30 d', 1, 30), ('31–60 d', 31, 60), ('61–90 d', 61, 90), ('90+ d', 91, None))


class AccountMove(models.Model):
    _inherit = 'account.move'

    # ------------------------------------------------------------------
    # Standard views shown in the pages (by xml id; a missing one falls
    # back to the model's default view)
    # ------------------------------------------------------------------
    @api.model
    def invoice_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        move = {
            'kanban': ref('account.view_account_move_kanban'),
            'form': ref('account.view_move_form'),
        }
        ids = {
            'invoice_list': ref('account.view_out_invoice_tree'),
            'invoice_search': ref('account.view_account_invoice_filter'),
            'credit_list': ref('account.view_out_credit_note_tree'),
            'credit_search': ref('account.view_account_invoice_filter'),
            'bill_list': ref('account.view_in_invoice_bill_tree'),
            'bill_search': ref('account.view_account_bill_filter'),
            'refund_list': ref('account.view_in_invoice_refund_tree'),
            'refund_search': ref('account.view_account_bill_filter'),
            'payin_list': ref('account.view_account_payment_tree'),
            'payout_list': ref('account.view_account_supplier_payment_tree'),
        }
        for prefix in ('invoice', 'credit', 'bill', 'refund'):
            for view_type, view_id in move.items():
                ids.setdefault(f'{prefix}_{view_type}', view_id)
        payment = {
            'kanban': ref('account.view_account_payment_kanban'),
            'form': ref('account.view_account_payment_form'),
            'search': ref('account.view_account_payment_search'),
            'graph': ref('account.view_account_payment_graph'),
        }
        for prefix in ('payin', 'payout'):
            for view_type, view_id in payment.items():
                ids.setdefault(f'{prefix}_{view_type}', view_id)
        return ids

    # ------------------------------------------------------------------
    # Owner dashboard
    # ------------------------------------------------------------------
    @api.model
    def invoice_modern_dashboard(self, period='month'):
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        Move = self

        def posted(types):
            return [('move_type', 'in', types), ('state', '=', 'posted')]

        def untaxed(types, a, b, sign=1):
            [(amount,)] = Move._read_group(
                posted(types) + [('invoice_date', '>=', a), ('invoice_date', '<', b)],
                aggregates=['amount_untaxed_signed:sum'])
            return (sign * (amount or 0.0)) or 0.0  # no -0.0

        def residual(domain, sign=1):
            [(amount, n)] = Move._read_group(domain, aggregates=['amount_residual_signed:sum', '__count'])
            return (sign * (amount or 0.0)) or 0.0, n

        invoiced, invoiced_prev = untaxed(OUT_TYPES, start, end), untaxed(OUT_TYPES, prev_start, prev_end)
        billed, billed_prev = untaxed(IN_TYPES, start, end, -1), untaxed(IN_TYPES, prev_start, prev_end, -1)

        open_out = posted(OUT_TYPES) + [('payment_state', 'in', OPEN)]
        open_in = posted(IN_TYPES) + [('payment_state', 'in', OPEN)]
        receivable, receivable_count = residual(open_out)
        payable, payable_count = residual(open_in, -1)
        overdue_out, overdue_out_count = residual(open_out + [('invoice_date_due', '<', today)])
        overdue_in, overdue_in_count = residual(open_in + [('invoice_date_due', '<', today)], -1)

        cash = self._invoice_modern_cash(start, end, prev_start, prev_end)

        kpis = {
            'invoiced': invoiced, 'invoiced_prev': invoiced_prev, 'invoiced_delta': growth(invoiced, invoiced_prev),
            'billed': billed, 'billed_prev': billed_prev, 'billed_delta': growth(billed, billed_prev),
            'receivable': receivable, 'receivable_count': receivable_count,
            'payable': payable, 'payable_count': payable_count,
            'overdue_out': overdue_out, 'overdue_out_count': overdue_out_count,
            'overdue_in': overdue_in, 'overdue_in_count': overdue_in_count,
            **cash,
        }

        # ---------- invoiced per month: this year vs last year ----------
        year_start = date_utils.start_of(today, 'year')

        def monthly(types, a, b, sign=1):
            return {
                month_key(m): (sign * (amount or 0.0)) or 0.0
                for m, amount in Move._read_group(
                    posted(types) + [('invoice_date', '>=', a), ('invoice_date', '<', b)],
                    ['invoice_date:month'], ['amount_untaxed_signed:sum'])
            }

        this_year = monthly(OUT_TYPES, year_start, year_start + relativedelta(years=1))
        last_year = monthly(OUT_TYPES, year_start - relativedelta(years=1), year_start)
        months = []
        for i in range(12):
            month = year_start + relativedelta(months=i)
            months.append({
                'label': month.strftime('%b'),
                'value': this_year.get(month, 0.0),
                'previous': last_year.get(month - relativedelta(years=1), 0.0),
                'future': month > today,
            })
        spark_start = date_utils.start_of(today, 'month') - relativedelta(months=11)
        spark_out = monthly(OUT_TYPES, spark_start, end)
        spark_in = monthly(IN_TYPES, spark_start, end, -1)
        sparks = {
            'invoiced': [spark_out.get(spark_start + relativedelta(months=i), 0.0) for i in range(12)],
            'billed': [spark_in.get(spark_start + relativedelta(months=i), 0.0) for i in range(12)],
        }

        # ---------- who owes whom, and for how long ----------
        def ageing(domain, sign=1):
            rows = []
            for label, low, high in AGEING:
                d = list(domain)
                if low is None:
                    d.append(('invoice_date_due', '>=', today))
                else:
                    d.append(('invoice_date_due', '<=', today - timedelta(days=low)))
                    if high is not None:
                        d.append(('invoice_date_due', '>', today - timedelta(days=high + 1)))
                [(amount,)] = Move._read_group(d, aggregates=['amount_residual_signed:sum'])
                rows.append({'label': label, 'value': (sign * (amount or 0.0)) or 0.0})
            return rows

        def top_partners(domain, sign=1):
            order = 'amount_residual_signed:sum desc' if sign > 0 else 'amount_residual_signed:sum asc'
            rows = [
                {'id': p.id, 'label': p.display_name, 'value': (sign * (amount or 0.0)) or 0.0, 'count': n}
                for p, amount, n in Move._read_group(
                    domain, ['commercial_partner_id'], ['amount_residual_signed:sum', '__count'], order=order, limit=10)
            ]
            # only partners with something actually owed (credit notes can net a balance out)
            return [r for r in rows if r['value'] > 0][:5]

        # ---------- what to do now ----------
        def count(domain):
            return Move.search_count(domain)

        week = today + timedelta(days=7)
        due_soon_domain = open_in + [('invoice_date_due', '>=', today), ('invoice_date_due', '<=', week)]
        due_soon, due_soon_count = residual(due_soon_domain, -1)
        attention = [
            {'key': 'draft_out', 'count': count([('move_type', 'in', OUT_TYPES), ('state', '=', 'draft')]),
             'tone': 'info', 'icon': 'fa-pencil', 'label': self.env._('Draft invoices to confirm')},
            {'key': 'not_sent', 'count': count(posted(('out_invoice',)) + [('is_move_sent', '=', False), ('payment_state', 'in', OPEN)]),
             'tone': 'violet', 'icon': 'fa-paper-plane-o', 'label': self.env._('Invoices not sent yet')},
            {'key': 'overdue_out', 'count': overdue_out_count, 'amount': overdue_out,
             'tone': 'danger', 'icon': 'fa-exclamation-circle', 'label': self.env._('Overdue customer invoices')},
            {'key': 'draft_in', 'count': count([('move_type', 'in', IN_TYPES), ('state', '=', 'draft')]),
             'tone': 'info', 'icon': 'fa-inbox', 'label': self.env._('Draft bills to check')},
            {'key': 'due_soon', 'count': due_soon_count, 'amount': due_soon,
             'tone': 'warning', 'icon': 'fa-calendar', 'label': self.env._('Bills due in the next 7 days')},
            {'key': 'overdue_in', 'count': overdue_in_count, 'amount': overdue_in,
             'tone': 'danger', 'icon': 'fa-clock-o', 'label': self.env._('Overdue vendor bills')},
        ]

        recent = self.search_read(posted(OUT_TYPES), LIST_FIELDS, order='invoice_date desc, id desc', limit=50)
        # invoice status tiles (shadcn "Track order status"): standard account.move states
        status = {
            'draft': count([('move_type', '=', 'out_invoice'), ('state', '=', 'draft')]),
            'not_paid': count(posted(('out_invoice',)) + [('payment_state', '=', 'not_paid')]),
            'partial': count(posted(('out_invoice',)) + [('payment_state', '=', 'partial')]),
            'overdue': overdue_out_count,
            'paid': count(posted(('out_invoice',)) + [('payment_state', 'in', ('paid', 'in_payment')),
                                                     ('invoice_date', '>=', start), ('invoice_date', '<', end)]),
        }
        currency = self.env.company.currency_id
        return {
            'currency_id': currency.id,
            'lakh': currency.name == 'BDT',
            'period': period if period in PERIODS else 'month',
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'week': fields.Date.to_string(week),
            'year': today.year,
            'company': self.env.company.name,
            'kpis': kpis,
            'sparks': sparks,
            'months': months,
            'ageing_out': ageing(open_out),
            'ageing_in': ageing(open_in, -1),
            'debtors': top_partners(open_out + [('invoice_date_due', '<', today)]),
            'creditors': top_partners(open_in, -1),
            'attention': attention,
            'recent': recent,
            'status': status,
        }

    @api.model
    def _invoice_modern_cash(self, start, end, prev_start, prev_end):
        """Cash received from customers and paid to vendors (only when payments are readable)."""
        empty = {'received': None, 'received_delta': None, 'paid': None, 'paid_delta': None}
        Payment = self.env['account.payment']
        if not Payment.browse().has_access('read'):
            return empty
        done = [('state', 'in', ('in_process', 'paid'))]

        def total(payment_type, partner_type, a, b):
            [(amount,)] = Payment._read_group(
                done + [('payment_type', '=', payment_type), ('partner_type', '=', partner_type),
                        ('date', '>=', a), ('date', '<', b)],
                aggregates=['amount_company_currency_signed:sum'])
            return abs(amount or 0.0)

        received, received_prev = total('inbound', 'customer', start, end), total('inbound', 'customer', prev_start, prev_end)
        paid, paid_prev = total('outbound', 'supplier', start, end), total('outbound', 'supplier', prev_start, prev_end)
        return {
            'received': received, 'received_prev': received_prev, 'received_delta': growth(received, received_prev),
            'paid': paid, 'paid_prev': paid_prev, 'paid_delta': growth(paid, paid_prev),
        }
