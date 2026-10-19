from dateutil.relativedelta import relativedelta

from odoo import Command, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import date_utils

QUOTATION_STATES = ('draft', 'sent')
ORDER_STATES = ('sale',)
ORDER_FIELDS = [
    'name', 'state', 'partner_id', 'user_id', 'date_order', 'validity_date', 'amount_untaxed',
    'amount_total', 'currency_id', 'invoice_status', 'invoice_count', 'locked',
]


def has_sale(env):
    """True when the Sales app and its CRM link (sale_crm) are installed."""
    return 'sale.order' in env and 'opportunity_id' in env['sale.order']._fields


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    @api.model
    def crm_modern_features(self):
        features = super().crm_modern_features()
        features['sale'] = has_sale(self.env) and self.env.user.has_group('sales_team.group_sale_salesman')
        return features

    @api.model
    def crm_modern_view_ids(self):
        ids = super().crm_modern_view_ids()
        if not has_sale(self.env):
            return ids

        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        ids.update({
            'quotation_search': ref('sale.sale_order_view_search_inherit_quotation'),
            'quotation_list': ref('sale.view_quotation_tree_with_onboarding'),
            'order_search': ref('sale.sale_order_view_search_inherit_sale'),
            'order_list': ref('sale.view_order_tree'),
        })
        for prefix in ('quotation', 'order'):
            ids.update({
                f'{prefix}_kanban': ref('sale.view_sale_order_kanban'),
                f'{prefix}_calendar': ref('sale.view_sale_order_calendar'),
                f'{prefix}_pivot': ref('sale.view_sale_order_pivot'),
                f'{prefix}_graph': ref('sale.view_sale_order_graph'),
                f'{prefix}_activity': ref('sale.sale_order_view_activity'),
                f'{prefix}_form': ref('sale.view_order_form'),
            })
        return ids

    @api.model
    def crm_modern_sale_data(self, lead_id):
        """Quotations and orders of one opportunity, for the record page card."""
        if not has_sale(self.env):
            return False
        lead = self.browse(lead_id).exists()
        if not lead:
            return False
        orders = self.env['sale.order'].search_read(
            [('opportunity_id', '=', lead.id)], ORDER_FIELDS, order='date_order desc, id desc')
        return {
            'orders': orders,
            'quotation_count': lead.quotation_count,
            'sale_order_count': lead.sale_order_count,
            'sale_amount_total': lead.sale_amount_total,
            'currency_id': lead.company_currency.id,
            'has_partner': bool(lead.partner_id),
            'partner_name': lead.partner_id.display_name or '',
            # what "create customer" would use when the opportunity has no customer yet
            'suggested_customer': lead.partner_name or lead.contact_name or lead.email_from or '',
        }

    def crm_modern_set_customer(self, partner_id=False):
        """Link an existing customer, or create one from the opportunity's contact details."""
        self.ensure_one()
        if partner_id:
            self.partner_id = partner_id
        elif not self.partner_id:
            # Odoo's own "convert to customer" logic (company + contact, duplicates matched by email)
            self._handle_partner_assignment(create_missing=True)
        return self.partner_id.id and {'id': self.partner_id.id, 'name': self.partner_id.display_name}

    def crm_modern_quick_quotation(self, lines, then='draft'):
        """Create a quotation for this opportunity from the compact quote builder.

        ``lines``: [{'product_id', 'qty', 'price_unit' (optional)}]. The order gets the
        same defaults as sale_crm's "New Quotation" button (customer, team, salesperson,
        campaign, origin, tags), so every standard Sales rule still applies.
        ``then``: 'draft' | 'send' | 'confirm'. Returns {'order_id', 'action'} where
        action is what the client should open next (mail composer for 'send').
        """
        self.ensure_one()
        if not has_sale(self.env):
            raise UserError(self.env._("The Sales app is not installed."))
        if not self.partner_id:
            raise UserError(self.env._("Choose the customer first."))
        order_lines = []
        for line in lines or []:
            if not line.get('product_id'):
                continue
            vals = {'product_id': int(line['product_id']), 'product_uom_qty': float(line.get('qty') or 1.0)}
            if line.get('price_unit') not in (None, '', False):
                vals['price_unit'] = float(line['price_unit'])
            order_lines.append(Command.create(vals))
        if not order_lines:
            raise UserError(self.env._("Add at least one product."))
        order = self.env['sale.order'].with_context(
            self._prepare_opportunity_quotation_context()
        ).create({'order_line': order_lines})
        action = False
        if then == 'confirm':
            result = order.action_confirm()
            action = result if isinstance(result, dict) else False
        elif then == 'send':
            action = order.action_quotation_send()
        return {'order_id': order.id, 'name': order.name, 'action': action}

    @api.model
    def crm_modern_sale_dashboard(self):
        """Sales figures coming from CRM opportunities (orders linked to an opportunity)."""
        if not has_sale(self.env):
            return False
        SaleOrder = self.env['sale.order']
        from_crm = [('opportunity_id', '!=', False)]
        month_start = date_utils.start_of(fields.Date.context_today(self), 'month')

        def total(domain):
            [(count, amount)] = SaleOrder._read_group(domain, aggregates=['__count', 'amount_untaxed:sum'])
            return count, amount or 0.0

        open_count, open_amount = total(from_crm + [('state', 'in', QUOTATION_STATES)])
        month_count, month_amount = total(from_crm + [('state', 'in', ORDER_STATES), ('date_order', '>=', month_start)])
        since = month_start - relativedelta(months=2)
        won_count, _won = total(from_crm + [('state', 'in', ORDER_STATES), ('date_order', '>=', since)])
        lost_count, _lost = total(from_crm + [('state', '=', 'cancel'), ('date_order', '>=', since)])
        sent_count, _sent = total(from_crm + [('state', 'in', QUOTATION_STATES + ORDER_STATES + ('cancel',)), ('date_order', '>=', since)])
        recent = SaleOrder.search_read(from_crm, ORDER_FIELDS + ['opportunity_id'], order='date_order desc, id desc', limit=6)
        return {
            'currency_id': self.env.company.currency_id.id,
            'lakh': self.env.company.currency_id.name == 'BDT',
            'open_quotations': open_count,
            'open_quotation_amount': open_amount,
            'orders_month': month_count,
            'orders_month_amount': month_amount,
            'conversion': round(won_count * 100 / sent_count) if sent_count else 0,
            'cancelled': lost_count,
            'recent': recent,
        }
