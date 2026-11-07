from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class PosBdOffer(models.Model):
    _name = 'pos.bd.offer'
    _description = 'POS offer'
    _order = 'sequence, id'

    name = fields.Char(required=True, help="Shown under the line: 'Eid offer 10%', 'Buy 2 get 1'…")
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company)
    kind = fields.Selection([
        ('percent', '% off products / categories'),
        ('bogo', 'Buy X get Y free'),
        ('bill', 'Money off the bill'),
    ], required=True, default='percent')
    date_from = fields.Date(string="From")
    date_to = fields.Date(string="Until")
    config_ids = fields.Many2many('pos.config', string="Shops", help="Empty = every shop")
    product_ids = fields.Many2many('product.product', string="Products")
    pos_categ_ids = fields.Many2many('pos.category', string="PoS categories")
    percent = fields.Float(string="Discount %")
    buy_qty = fields.Integer(string="Buy", default=2)
    get_qty = fields.Integer(string="Get free", default=1)
    min_amount = fields.Float(string="Bill from")
    amount = fields.Float(string="Money off")

    @api.constrains('percent', 'buy_qty', 'get_qty')
    def _check_values(self):
        for offer in self:
            if offer.kind == 'percent' and not 0 < offer.percent <= 100:
                raise ValidationError(_("The discount of %s must be between 0 and 100%%.", offer.name))
            if offer.kind == 'bogo' and (offer.buy_qty < 1 or offer.get_qty < 1):
                raise ValidationError(_("Buy and Get of %s must be at least 1.", offer.name))

    def _applies_to(self, product):
        self.ensure_one()
        if not self.product_ids and not self.pos_categ_ids:
            return True  # every product
        return product in self.product_ids or bool(product.pos_categ_ids & self.pos_categ_ids)

    @api.model
    def _pos_active(self, config):
        today = fields.Date.context_today(self)
        domain = [('company_id', 'in', [config.company_id.id, False]),
                  '|', ('date_from', '=', False), ('date_from', '<=', today),
                  '|', ('date_to', '=', False), ('date_to', '>=', today),
                  '|', ('config_ids', '=', False), ('config_ids', 'in', config.id)]
        return self.search(domain)
