import re
from collections import defaultdict

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import format_datetime
from odoo.tools.misc import formatLang

from odoo.addons.modern_theme.tools import local_midnight

from .pos_payment_method import ICONS, WALLETS

WALLET_SETUP = [
    # provider, name, journal code
    ('bkash', 'bKash', 'BKSH'),
    ('nagad', 'Nagad', 'NGD'),
    ('rocket', 'Rocket', 'RCKT'),
    ('upay', 'Upay', 'UPAY'),
]


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # ------------------------------------------------------------------ counter hooks
    def _pos_modern_features(self):
        features = super()._pos_modern_features()
        company = self.company_id.sudo()
        features['sms'] = (company.bd_sms_provider or 'none') != 'none'
        features['sms_auto'] = features['sms'] and company.bd_sms_auto
        return features

    def _pos_modern_method_row(self, method):
        row = super()._pos_modern_method_row(method)
        if method.bd_provider:
            row.update({
                'provider': method.bd_provider,
                'needs_ref': method.bd_needs_trx,
                'needs_phone': method.bd_needs_phone,
                'trx_pattern': method.bd_trx_pattern or '',
                'merchant': method.bd_merchant_number or '',
                'icon': ICONS.get(method.bd_provider, 'fa-credit-card'),
                'ref_label': _('%s TrxID', method.name) if method.bd_provider in WALLETS else _('Transaction / slip no.'),
            })
            if method.bd_provider in WALLETS:
                row['kind'] = 'wallet'
        return row

    def _pos_modern_check_payments(self, payments, quote, partner, payload):
        res = super()._pos_modern_check_payments(payments, quote, partner, payload)
        methods = self.env['pos.payment.method'].browse([int(p['method_id']) for p in payments])
        by_id = {m.id: m for m in methods}
        seen = set()
        Payment = self.env['pos.payment'].sudo()
        for payment in payments:
            method = by_id[int(payment['method_id'])]
            ref = re.sub(r'\s+', '', (payment.get('ref') or '')).upper()
            if not method.bd_provider:
                continue
            if method.bd_needs_trx and not ref and float(payment.get('amount') or 0) > 0:
                raise UserError(_("Type the TrxID of the %s payment.", method.name))
            if ref and method.bd_trx_pattern and not re.match(method.bd_trx_pattern, ref):
                raise UserError(_("“%(ref)s” is not a valid %(method)s TrxID.", ref=ref, method=method.name))
            if ref:
                key = (method.bd_provider, ref)
                if key in seen:
                    raise UserError(_("The TrxID %s is typed twice.", ref))
                seen.add(key)
                used = Payment.search([('transaction_id', '=', ref), ('bd_provider', '=', method.bd_provider),
                                       ('pos_order_id.state', '!=', 'cancel')], limit=1)
                if used:
                    raise UserError(_("TrxID %(ref)s was already used on %(order)s (%(date)s).", ref=ref,
                                      order=used.pos_order_id.pos_reference or used.pos_order_id.name,
                                      date=format_datetime(self.env, used.payment_date, dt_format='dd/MM/yyyy HH:mm')))
        return res

    def _pos_modern_payment_vals(self, method, payment, payload):
        vals = super()._pos_modern_payment_vals(method, payment, payload)
        if vals.get('transaction_id'):
            vals['transaction_id'] = re.sub(r'\s+', '', vals['transaction_id']).upper()
        phone = (payment.get('phone') or '').strip()
        if phone:
            vals['bd_payer_phone'] = phone[:32]
        return vals

    def _pos_modern_after_order(self, order, payload):
        res = super()._pos_modern_after_order(order, payload)
        company = order.company_id.sudo()
        extra = payload.get('extra') or {}
        wants = extra.get('sms') if 'sms' in extra else company.bd_sms_auto
        phone = extra.get('sms_phone') or order.partner_id.phone
        if wants and (company.bd_sms_provider or 'none') != 'none' and phone:
            order._pos_bd_queue_sms(phone)
        return res

    # ------------------------------------------------------------------ setup
    def pos_bd_setup_wallets(self, providers=None):
        """Create bKash / Nagad / Rocket / Upay payment methods (one bank journal each) and
        add them to this shop. Existing ones are reused."""
        self.ensure_one()
        if self.current_session_id:
            raise UserError(_("Close the session of %s before changing its payment methods.", self.name))
        company = self.company_id
        Journal = self.env['account.journal'].sudo()
        Method = self.env['pos.payment.method'].sudo()
        wanted = providers or [p for p, __, __ in WALLET_SETUP]
        added = self.env['pos.payment.method']
        for provider, name, code in WALLET_SETUP:
            if provider not in wanted:
                continue
            method = Method.search([('bd_provider', '=', provider), ('company_id', '=', company.id)], limit=1)
            if not method:
                journal = Journal.search([('code', '=', code), ('company_id', '=', company.id)], limit=1)
                if not journal:
                    journal = Journal.create({'name': name, 'code': code, 'type': 'bank', 'company_id': company.id})
                method = Method.create({
                    'name': name,
                    'journal_id': journal.id,
                    'company_id': company.id,
                    'bd_provider': provider,
                    'bd_needs_trx': True,
                    'bd_needs_phone': True,
                })
            added |= method
        self.sudo().payment_method_ids = [(4, m.id) for m in added]
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Mobile wallets ready"),
                'message': _("%(methods)s added to %(shop)s.", methods=', '.join(added.mapped('name')), shop=self.name),
                'type': 'success',
                'next': {'type': 'ir.actions.act_window_close'},
            },
        }

    # ------------------------------------------------------------------ reconciliation page
    @api.model
    def pos_bd_reconcile_data(self, date_from=False, date_to=False, config_id=False, provider=False, state='all'):
        """Wallet / card payments with their TrxID for the reconciliation page."""
        today = fields.Date.context_today(self)
        date_from = fields.Date.to_date(date_from) if date_from else today
        date_to = fields.Date.to_date(date_to) if date_to else today
        start = local_midnight(date_from, tz=self.env.tz)
        end = local_midnight(fields.Date.add(date_to, days=1), tz=self.env.tz)
        domain = [('bd_provider', '!=', False), ('payment_date', '>=', start), ('payment_date', '<', end),
                  ('pos_order_id.state', 'in', ('paid', 'done', 'invoiced')),
                  ('company_id', 'in', self.env.companies.ids)]
        if config_id:
            domain.append(('pos_order_id.config_id', '=', int(config_id)))
        if provider:
            domain.append(('bd_provider', '=', provider))
        if state == 'todo':
            domain.append(('bd_verified', '=', False))
        elif state == 'done':
            domain.append(('bd_verified', '=', True))
        payments = self.env['pos.payment'].search(domain, order='payment_date desc', limit=2000)
        totals = defaultdict(lambda: {'count': 0, 'amount': 0.0, 'verified': 0.0})
        for p in payments:
            t = totals[p.payment_method_id.name]
            t['count'] += 1
            t['amount'] += p.amount
            if p.bd_verified:
                t['verified'] += p.amount
        company = self.env.company
        return {
            'date_from': fields.Date.to_string(date_from),
            'date_to': fields.Date.to_string(date_to),
            'currency_id': company.currency_id.id,
            'shops': [{'id': c.id, 'name': c.name} for c in self.search([('company_id', 'in', self.env.companies.ids)])],
            'providers': [{'id': k, 'name': v} for k, v in self.env['pos.payment.method']._fields['bd_provider'].selection],
            'totals': [{'name': k, **v} for k, v in totals.items()],
            'rows': [{
                'id': p.id,
                'date': fields.Datetime.to_string(p.payment_date),
                'order': p.pos_order_id.pos_reference or p.pos_order_id.name,
                'order_id': p.pos_order_id.id,
                'shop': p.pos_order_id.config_id.name,
                'method': p.payment_method_id.name,
                'provider': p.bd_provider,
                'amount': p.amount,
                'trx': p.transaction_id or '',
                'phone': p.bd_payer_phone or '',
                'verified': p.bd_verified,
            } for p in payments],
        }

    @api.model
    def pos_bd_reconcile_match(self, payment_ids, statement_text):
        """Tick the payments whose TrxID appears in a pasted merchant statement."""
        tokens = set(re.findall(r'[A-Z0-9]{6,20}', (statement_text or '').upper()))
        payments = self.env['pos.payment'].browse(payment_ids).exists()
        matched = payments.filtered(lambda p: p.transaction_id and p.transaction_id.upper() in tokens)
        matched.pos_bd_set_verified(True)
        known = {p.transaction_id.upper() for p in payments if p.transaction_id}
        unknown = sorted(t for t in tokens if t not in known and re.search(r'[A-Z]', t) and re.search(r'\d', t))
        return {'matched': len(matched), 'unknown': unknown[:50]}


class PosOrder(models.Model):
    _inherit = 'pos.order'

    bd_sms_ids = fields.One2many('pos.bd.sms', 'order_id', string="SMS")

    def _pos_bd_sms_body(self):
        self.ensure_one()
        company = self.company_id.sudo()
        template = company.bd_sms_template or "Thank you for shopping at {shop}. Bill {ref}: {total}."
        values = {
            'shop': self.config_id.name or company.name,
            'ref': self.pos_reference or self.name,
            'total': formatLang(self.env, self.amount_total, currency_obj=self.currency_id),
            'date': fields.Datetime.context_timestamp(self, self.date_order).strftime('%d/%m/%Y %H:%M'),
            'customer': self.partner_id.name or '',
            'extra': self._pos_bd_sms_extra(),
        }
        try:
            return template.format(**values).strip()
        except (KeyError, IndexError, ValueError):
            return "%(shop)s: %(ref)s %(total)s" % values

    def _pos_bd_sms_extra(self):
        """Shop addons add a line (loyalty points, due balance…)."""
        return ''

    def _pos_bd_queue_sms(self, phone=None):
        self.ensure_one()
        return self.env['pos.bd.sms'].pos_bd_queue(phone or self.partner_id.phone, self._pos_bd_sms_body(), order=self)

    def pos_bd_send_sms(self, phone=None):
        """'SMS receipt' button of the counter: queue and send at once."""
        self.ensure_one()
        sms = self._pos_bd_queue_sms(phone)
        sms._pos_bd_send()
        return {'state': sms.state, 'to': sms.to, 'response': sms.response or ''}

    def _pos_modern_receipt_data(self):
        data = super()._pos_modern_receipt_data()
        phones = {}
        for payment in self.payment_ids.filtered('bd_payer_phone'):
            phones[payment.payment_method_id.id] = payment.bd_payer_phone
        for row in data['payments']:
            if row.get('method_id') in phones:
                row['phone'] = phones[row['method_id']]
        return data


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _pos_modern_session_report_extra(self, report):
        report = super()._pos_modern_session_report_extra(report)
        payments = self.order_ids.filtered(lambda o: o.state in ('paid', 'done', 'invoiced')).payment_ids
        wallets = payments.filtered(lambda p: p.bd_provider and not p.is_change)
        rows = defaultdict(lambda: {'count': 0, 'amount': 0.0, 'verified': 0.0})
        for p in wallets:
            r = rows[p.payment_method_id.name]
            r['count'] += 1
            r['amount'] += p.amount
            if p.bd_verified:
                r['verified'] += p.amount
        report['extra']['wallets'] = [{'name': k, **v} for k, v in rows.items()]
        return report
