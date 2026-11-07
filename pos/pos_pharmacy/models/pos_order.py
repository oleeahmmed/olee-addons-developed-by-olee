from odoo import fields, models
from odoo.tools import format_date


class PosOrder(models.Model):
    _inherit = 'pos.order'

    ph_doctor = fields.Char(string="Doctor")
    ph_patient = fields.Char(string="Patient")
    ph_patient_age = fields.Char(string="Age")
    ph_rx_ref = fields.Char(string="Prescription no.")

    def _pos_modern_receipt_data(self):
        data = super()._pos_modern_receipt_data()
        if not self.config_id.ph_pharmacy:
            return data
        lines = {l.id: l for l in self.lines}
        for row in data['lines']:
            line = lines.get(row.get('id'))
            if not line:
                continue
            tmpl = line.product_id.product_tmpl_id
            if tmpl.ph_generic_name:
                row['generic'] = ' '.join(filter(None, [tmpl.ph_generic_name, tmpl.ph_strength]))
            lots = self.env['stock.lot'].sudo().search([('name', 'in', row.get('lots') or []),
                                                        ('product_id', '=', line.product_id.id)])
            row['lots'] = ['%s (exp. %s)' % (lot.name, format_date(self.env, lot.expiration_date))
                           if lot.expiration_date else lot.name for lot in lots] or row.get('lots', [])
        if self.ph_doctor or self.ph_patient:
            data['extra']['rx'] = {
                'doctor': self.ph_doctor or '',
                'patient': self.ph_patient or '',
                'age': self.ph_patient_age or '',
                'ref': self.ph_rx_ref or '',
            }
        return data
