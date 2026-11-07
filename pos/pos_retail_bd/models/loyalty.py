from odoo import api, fields, models


class PosBdPointsMove(models.Model):
    _name = 'pos.bd.points.move'
    _description = 'Loyalty points (POS)'
    _order = 'id desc'

    partner_id = fields.Many2one('res.partner', required=True, index=True, ondelete='cascade')
    points = fields.Float(required=True, help="Positive: earned, negative: redeemed")
    order_id = fields.Many2one('pos.order', index='btree_not_null', ondelete='set null')
    name = fields.Char(string="Reason")
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    rt_points = fields.Float(string="Loyalty points", compute='_compute_rt_points')
    rt_points_move_ids = fields.One2many('pos.bd.points.move', 'partner_id', string="Points history")
    rt_credit_limit = fields.Float(string="Baki limit", help="Most a customer may owe the shop. 0 = no credit.")

    @api.depends('rt_points_move_ids.points')
    def _compute_rt_points(self):
        groups = self.env['pos.bd.points.move'].sudo()._read_group(
            [('partner_id', 'in', self.ids)], ['partner_id'], ['points:sum'])
        totals = {p.id: s for p, s in groups}
        for partner in self:
            partner.rt_points = totals.get(partner.id, 0.0)

    def _rt_open_due(self):
        """Due not posted yet: customer-account payments of sessions still open."""
        self.ensure_one()
        payments = self.env['pos.payment'].sudo().search([
            ('pos_order_id.partner_id', '=', self.id), ('payment_method_id.journal_id', '=', False),
            ('session_id.state', '!=', 'closed')])
        return sum(payments.filtered(lambda p: p.payment_method_id.type == 'pay_later').mapped('amount'))

    def _rt_due(self):
        self.ensure_one()
        return self.sudo().credit + self._rt_open_due()


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    rt_pack_name = fields.Char(string="Pack name", help="Carton, Box, Dozen, Sack… sold whole at the counter.")
    rt_pack_qty = fields.Float(string="Pieces per pack")
    rt_quick = fields.Boolean(string="Quick key", help="A big button on top of the counter (loose items without barcode).")
