import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError

HEX_COLOR_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}){1,2}$')
DEFAULT_ACCENT = '#714B67'


def _hex_to_rgb(value):
    value = value.strip().lstrip('#')
    if len(value) == 3:
        value = ''.join(char * 2 for char in value)
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def mix_colors(foreground, background, weight):
    fg, bg = _hex_to_rgb(foreground), _hex_to_rgb(background)
    return '#%02x%02x%02x' % tuple(round(fg[i] * weight + bg[i] * (1 - weight)) for i in range(3))


class ResCompany(models.Model):
    _inherit = 'res.company'

    mr_accent_color = fields.Char(string='Document Accent Colour', default=DEFAULT_ACCENT)
    mr_payment_method_ids = fields.One2many('modern.reports.payment.method', 'company_id')

    @api.constrains('mr_accent_color')
    def _check_mr_accent_color(self):
        for company in self:
            if company.mr_accent_color and not HEX_COLOR_RE.match(company.mr_accent_color.strip()):
                raise ValidationError(self.env._('The document accent colour must look like #714B67.'))

    def _mr_style(self):
        self.ensure_one()
        accent = (self.mr_accent_color or DEFAULT_ACCENT).strip()
        return {
            'accent': accent,
            'soft': mix_colors(accent, '#ffffff', 0.07),
            'soft_border': mix_colors(accent, '#ffffff', 0.4),
        }
