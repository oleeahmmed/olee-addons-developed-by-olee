from odoo import models


class StockPicking(models.Model):
    _name = 'stock.picking'
    _inherit = ['stock.picking', 'modern.reports.document']

    def _mr_report_xmlid(self):
        return 'stock.action_report_delivery'

    def _mr_title(self):
        _ = self.env._
        code = self.picking_type_code
        if code == 'incoming':
            title = _('Goods Receipt')
        elif code == 'internal':
            title = _('Internal Transfer')
        else:
            title = _('Delivery Slip')
        if self.state == 'cancel':
            return _('Cancelled %s', title)
        return title

    # ---- lines ------------------------------------------------------------

    def _mr_uom_qty(self, quantity, uom):
        return self._mr_qty(quantity or 0.0, uom) if quantity is not None else ''

    def _mr_move_rows(self):
        """Not done yet: one row per move, ordered and (reserved / picked) quantities."""
        rows = []
        for move in self.move_ids.filtered('product_uom_qty'):
            description = move._get_report_description_picking() if (
                move.description_picking and move.description_picking.strip() != move.product_id.name.strip()) else ''
            rows.append({
                'type': 'product',
                'title': move.product_id.display_name,
                'extra': (description or '').replace('\n', ' '),
                'indent': 0,
                'qty': self._mr_uom_qty(move.product_uom_qty, move.product_uom),
                'qty2': self._mr_uom_qty(move.quantity, move.product_uom),
                'price': '', 'discount': 0.0, 'discount_str': '', 'taxes': '', 'amount': '',
            })
        return rows

    def _mr_move_line_rows(self, move_lines, with_lots):
        """Done: one row per lot / serial when they are printed, else products summed up."""
        _ = self.env._
        rows = []
        if with_lots and move_lines.lot_id:
            for line in move_lines:
                rows.append({
                    'type': 'product',
                    'title': line.product_id.display_name,
                    'extra': _('Lot/Serial: %s', line.lot_id.name) if line.lot_id else '',
                    'indent': 0,
                    'qty': '',
                    'qty2': self._mr_uom_qty(line.quantity, line.product_uom_id),
                    'price': '', 'discount': 0.0, 'discount_str': '', 'taxes': '', 'amount': '',
                })
            return rows
        for values in move_lines._get_aggregated_product_quantities().values():
            rows.append({
                'type': 'product',
                'title': values['name'],
                'extra': (values.get('description') or '').replace('\n', ' '),
                'indent': 0,
                'qty': self._mr_uom_qty(values.get('qty_ordered'), values['product_uom']),
                'qty2': self._mr_uom_qty(values.get('quantity'), values['product_uom']),
                'price': '', 'discount': 0.0, 'discount_str': '', 'taxes': '', 'amount': '',
            })
        return rows

    def _mr_line_rows(self):
        if self.state != 'done' or not self.move_line_ids:
            return self._mr_move_rows()
        _ = self.env._
        with_lots = self.env.user.has_group('stock.group_lot_on_delivery_slip')
        move_lines = self.move_line_ids
        packages = move_lines.result_package_id
        if not packages:
            return self._mr_move_line_rows(move_lines, with_lots)
        rows = []
        for package in packages.sorted('name'):
            rows.append(self._mr_section_row(package.name))
            rows += self._mr_move_line_rows(move_lines.filtered(lambda l: l.result_package_id == package), with_lots)
        loose = move_lines.filtered(lambda l: not l.result_package_id)
        if loose:
            rows.append(self._mr_section_row(_('Products with no package')))
            rows += self._mr_move_line_rows(loose, with_lots)
        return rows

    # ---- document ---------------------------------------------------------

    def _mr_values(self, **options):
        self.ensure_one()
        _ = self.env._
        code = self.picking_type_code
        values = self._mr_base_values()
        values['title'] = self._mr_title()
        done = self.state == 'done'
        values['info_rows'] = self._mr_rows(
            (_('Reference'), self.name),
            (_('Date Done') if done else _('Scheduled Date'),
             self._mr_date((self.date_done if done else self.scheduled_date) or False)),
            (_('Source'), self.origin),
        )
        partner = (self.move_ids[:1].partner_id or self.partner_id) if code == 'outgoing' else self.partner_id
        label = {'outgoing': _('Deliver To'), 'incoming': _('Received From')}.get(code, _('Contact'))
        if partner:
            values['party'] = self._mr_party_values(partner, label)
        else:
            warehouse = self.picking_type_id.warehouse_id
            values['party'] = self._mr_party_values(
                warehouse.partner_id or self.company_id.partner_id, _('Warehouse'))
        carrier = self.carrier_id.name if 'carrier_id' in self._fields and self.carrier_id else ''
        tracking = self.carrier_tracking_ref if 'carrier_tracking_ref' in self._fields else ''
        values['side_rows'] = self._mr_rows(
            (_('Operation'), self.picking_type_id.name),
            (_('Warehouse'), self.picking_type_id.warehouse_id.name),
            (_('From'), self.location_id.display_name if code != 'outgoing' else ''),
            (_('To'), self.location_dest_id.display_name if code != 'incoming' else ''),
            (_('Responsible'), self.user_id.name),
            (_('Carrier'), carrier),
            (_('Tracking'), tracking),
        )
        values['show_prices'] = False
        values['qty_label'] = _('Ordered')
        values['qty2_label'] = {'outgoing': _('Delivered'), 'incoming': _('Received')}.get(code, _('Done'))
        values['lines'] = self._mr_line_rows()
        values['notes'] = self._mr_text_lines(self.note)
        if self.signature:
            values['customer_signature'] = {
                'image': self.signature,
                'name': partner.name if partner else '',
                'date': self._mr_date(self.date_done.date()) if self.date_done else '',
            }
        if code == 'incoming':
            values['signatures'] = (_('Delivered By'), _('Received By'))
        else:
            values['signatures'] = (_('Received By'), _('Delivered By'))
        values['footer_note'] = _('This is a computer-generated document.')
        return self._mr_finish(values)
