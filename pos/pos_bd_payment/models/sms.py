"""SMS receipts through a Bangladeshi SMS gateway.

Messages are queued (pos.bd.sms) and sent by a cron job every minute, so a slow gateway
never makes the cashier wait. "Send now" sends one message at once.

Gateways (check the exact API of your account with the provider):
* BulkSMSBD: GET http://bulksmsbd.net/api/smsapi?api_key=&type=text&number=&senderid=&message=
* SSL Wireless (SMS Plus v3): POST https://smsplus.sslwireless.com/api/v3/send-sms
  JSON {api_token, sid, msisdn, sms, csms_id}
* Custom: any URL with {to} {message} {api_key} {sender} placeholders (GET), for
  Alpha SMS, Reve, Muthofun, Banglalink / GP enterprise gateways…
"""
import json
import logging
import re
from urllib.parse import quote

import requests

from odoo import _, api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

TIMEOUT = 10


def bd_msisdn(phone):
    """'01712-345678', '+880 1712 345678', '8801712345678' -> '8801712345678' (or '' if not a BD mobile)."""
    digits = re.sub(r'\D', '', phone or '')
    if digits.startswith('880'):
        digits = digits[3:]
    if digits.startswith('0'):
        digits = digits[1:]
    if len(digits) == 10 and digits.startswith('1'):
        return '880' + digits
    return ''


class ResCompany(models.Model):
    _inherit = 'res.company'

    bd_sms_provider = fields.Selection([
        ('none', 'No SMS'),
        ('bulksmsbd', 'BulkSMSBD'),
        ('sslwireless', 'SSL Wireless (SMS Plus)'),
        ('custom', 'Custom HTTP gateway'),
    ], string="SMS gateway", default='none')
    bd_sms_api_key = fields.Char(string="API key / token", groups='base.group_system')
    bd_sms_sender = fields.Char(string="Sender ID / SID", help="Masking name or SID given by the gateway.")
    bd_sms_url = fields.Char(string="Custom URL",
                             help="GET URL with placeholders {to} {message} {api_key} {sender}.")
    bd_sms_auto = fields.Boolean(string="Send the receipt by SMS after each sale",
                                 help="Only when the customer has a mobile number.")
    bd_sms_template = fields.Text(
        string="Receipt SMS",
        default="Thank you for shopping at {shop}. Bill {ref}: {total}. {extra}",
        help="Placeholders: {shop} {ref} {total} {date} {customer} {extra}")


class PosBdSms(models.Model):
    _name = 'pos.bd.sms'
    _description = 'SMS sent from the POS'
    _order = 'id desc'

    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company, index=True)
    to = fields.Char(string="To", required=True)
    body = fields.Text(string="Message", required=True)
    order_id = fields.Many2one('pos.order', string="Order", index='btree_not_null', ondelete='set null')
    partner_id = fields.Many2one('res.partner', string="Customer")
    state = fields.Selection([('queued', 'Queued'), ('sent', 'Sent'), ('error', 'Error')], default='queued',
                             required=True, index=True)
    attempts = fields.Integer()
    response = fields.Text(string="Gateway answer")
    sent_at = fields.Datetime(string="Sent on")

    @api.model
    def pos_bd_queue(self, to, body, order=None, company=None):
        msisdn = bd_msisdn(to)
        if not msisdn:
            raise UserError(_("%s is not a Bangladeshi mobile number.", to or '—'))
        company = company or (order.company_id if order else self.env.company)
        if (company.sudo().bd_sms_provider or 'none') == 'none':
            raise UserError(_("Choose an SMS gateway first (Point of Sale ▸ Configuration ▸ SMS gateway)."))
        return self.sudo().create({
            'company_id': company.id,
            'to': msisdn,
            'body': body[:640],
            'order_id': order.id if order else False,
            'partner_id': order.partner_id.id if order and order.partner_id else False,
        })

    def _pos_bd_send(self):
        for sms in self.sudo():
            company = sms.company_id
            sms.attempts += 1
            try:
                ok, answer = sms._pos_bd_call(company)
            except requests.RequestException as error:
                ok, answer = False, str(error)
            sms.write({
                'state': 'sent' if ok else ('error' if sms.attempts >= 3 else 'queued'),
                'response': (answer or '')[:2000],
                'sent_at': fields.Datetime.now() if ok else False,
            })

    def _pos_bd_call(self, company):
        provider = company.bd_sms_provider
        key = company.bd_sms_api_key or ''
        sender = company.bd_sms_sender or ''
        if provider == 'bulksmsbd':
            res = requests.get('http://bulksmsbd.net/api/smsapi', params={
                'api_key': key, 'type': 'text', 'number': self.to, 'senderid': sender, 'message': self.body,
            }, timeout=TIMEOUT)
            text = res.text
            try:
                code = json.loads(text).get('response_code')
            except ValueError:
                code = None
            return res.ok and code in (202, '202'), text
        if provider == 'sslwireless':
            res = requests.post('https://smsplus.sslwireless.com/api/v3/send-sms', json={
                'api_token': key, 'sid': sender, 'msisdn': self.to, 'sms': self.body, 'csms_id': 'POS%s' % self.id,
            }, timeout=TIMEOUT)
            text = res.text
            try:
                status = json.loads(text).get('status')
            except ValueError:
                status = None
            return res.ok and str(status).upper() == 'SUCCESS', text
        if provider == 'custom' and company.bd_sms_url:
            url = company.bd_sms_url.format(to=quote(self.to), message=quote(self.body), api_key=quote(key),
                                            sender=quote(sender))
            res = requests.get(url, timeout=TIMEOUT)
            return res.ok, res.text
        return False, _("No SMS gateway configured.")

    def action_send_now(self):
        self._pos_bd_send()
        return True

    def action_retry(self):
        self.write({'state': 'queued', 'attempts': 0})
        self._pos_bd_send()
        return True

    @api.model
    def _cron_send(self):
        self.search([('state', '=', 'queued')], limit=100)._pos_bd_send()
