from datetime import timedelta

from odoo import _, api, fields, models
from odoo.tools import format_datetime

ORDER_TYPES = [('dine_in', 'Dine-in'), ('takeaway', 'Takeaway'), ('delivery', 'Delivery')]


class PosRbTicket(models.Model):
    _name = 'pos.rb.ticket'
    _description = 'Kitchen order ticket (KOT)'
    _order = 'create_date, id'

    name = fields.Char(string='KOT', required=True, default='/')
    config_id = fields.Many2one('pos.config', string='Shop', required=True, index=True, ondelete='cascade')
    order_type = fields.Selection(ORDER_TYPES, default='dine_in')
    table_name = fields.Char(string='Table')
    customer = fields.Char()
    note = fields.Char()
    state = fields.Selection([('new', 'New'), ('cooking', 'Cooking'), ('ready', 'Ready'), ('served', 'Served'),
                              ('cancel', 'Cancelled')], default='new', required=True, index=True)
    line_ids = fields.One2many('pos.rb.ticket.line', 'ticket_id', string='Items')
    order_id = fields.Many2one('pos.order', index='btree_not_null', ondelete='set null')
    hold_ref = fields.Integer(string='Open bill', index=True)
    ready_at = fields.Datetime()
    served_at = fields.Datetime()
    user_id = fields.Many2one('res.users', default=lambda self: self.env.user)

    @api.model_create_multi
    def create(self, vals_list):
        today = fields.Datetime.now().replace(hour=0, minute=0, second=0)
        for vals in vals_list:
            if vals.get('name', '/') == '/':
                count = self.search_count([('config_id', '=', vals.get('config_id')), ('create_date', '>=', today)])
                vals['name'] = 'K%03d' % (count + 1)
        return super().create(vals_list)

    def _rb_row(self):
        self.ensure_one()
        now = fields.Datetime.now()
        late = self.config_id.rb_late_minutes or 15
        age = int((now - self.create_date).total_seconds() // 60) if self.create_date else 0
        return {
            'id': self.id,
            'name': self.name,
            'type': self.order_type,
            'type_label': dict(ORDER_TYPES).get(self.order_type, ''),
            'table': self.table_name or '',
            'customer': self.customer or '',
            'note': self.note or '',
            'state': self.state,
            'age': age,
            'late': self.state in ('new', 'cooking') and age >= late,
            'time': format_datetime(self.env, self.create_date, dt_format='HH:mm') if self.create_date else '',
            'station': self.line_ids[:1].station or '' if self.config_id.rb_station_split else '',
            'lines': [{'id': l.id, 'name': l.name, 'qty': l.qty, 'note': l.note or '', 'done': l.done,
                       'station': l.station or ''} for l in self.line_ids],
        }

    def pos_rb_set_state(self, state):
        vals = {'state': state}
        if state == 'ready':
            vals['ready_at'] = fields.Datetime.now()
        if state == 'served':
            vals['served_at'] = fields.Datetime.now()
        self.write(vals)
        return True


class PosRbStaff(models.Model):
    """Waiters and riders of a restaurant (they need no Odoo user)."""
    _name = 'pos.rb.staff'
    _description = 'Restaurant waiter / rider'
    _order = 'kind, name'

    name = fields.Char(required=True)
    kind = fields.Selection([('waiter', 'Waiter'), ('rider', 'Rider')], default='waiter', required=True)
    phone = fields.Char()
    active = fields.Boolean(default=True)
    config_ids = fields.Many2many('pos.config', string='Shops', help="Empty = every shop")
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company)


class PosRbTicketLine(models.Model):
    _name = 'pos.rb.ticket.line'
    _description = 'Kitchen order ticket line'

    ticket_id = fields.Many2one('pos.rb.ticket', required=True, ondelete='cascade', index=True)
    product_id = fields.Many2one('product.product')
    name = fields.Char(required=True)
    qty = fields.Float(default=1.0)
    note = fields.Char()
    station = fields.Char(help="PoS category of the product (grill, drinks…)")
    done = fields.Boolean()

    def pos_rb_toggle(self):
        for line in self:
            line.done = not line.done
        return True
