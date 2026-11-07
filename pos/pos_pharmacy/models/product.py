from odoo import fields, models

DOSAGE_FORMS = [
    ('tablet', 'Tablet'), ('capsule', 'Capsule'), ('syrup', 'Syrup / Suspension'), ('injection', 'Injection'),
    ('drops', 'Drops'), ('cream', 'Cream / Ointment'), ('inhaler', 'Inhaler'), ('powder', 'Powder / Sachet'),
    ('suppository', 'Suppository'), ('device', 'Device / Surgical'), ('other', 'Other'),
]


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    ph_is_medicine = fields.Boolean(string="Medicine")
    ph_generic_name = fields.Char(string="Generic name", index='trigram')
    ph_strength = fields.Char(string="Strength", help="500 mg, 5 mg/5 ml…")
    ph_dosage_form = fields.Selection(DOSAGE_FORMS, string="Dosage form")
    ph_manufacturer = fields.Char(string="Manufacturer", help="Square, Beximco, Incepta…")
    ph_rx_required = fields.Boolean(string="Prescription required")
    ph_rack = fields.Char(string="Rack / shelf")
    ph_strip_size = fields.Integer(string="Pieces per strip", help="0 = not sold by strip")
    ph_box_size = fields.Integer(string="Strips per box", help="0 = not sold by box")
