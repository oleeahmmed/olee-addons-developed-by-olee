import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError

HEX_COLOR_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}){1,2}$')


def _hex_to_rgb(value):
    value = value.strip().lstrip('#')
    if len(value) == 3:
        value = ''.join(char * 2 for char in value)
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def _mix_colors(foreground, background, foreground_weight):
    foreground_rgb = _hex_to_rgb(foreground)
    background_rgb = _hex_to_rgb(background)
    mixed = tuple(
        foreground_rgb[index] * foreground_weight + background_rgb[index] * (1 - foreground_weight)
        for index in range(3)
    )
    return '#%02x%02x%02x' % tuple(int(round(channel)) for channel in mixed)


class ResCompany(models.Model):
    _inherit = 'res.company'

    mr_doc_accent_color = fields.Char(
        string='Document Accent Colour',
        help='Leave empty to use the Modern Theme brand colour.',
    )
    mr_doc_background = fields.Selection(
        [('white', 'White'), ('tint', 'Soft accent tint'), ('custom', 'Custom colour')],
        string='Document Background', default='white', required=True,
    )
    mr_doc_background_color = fields.Char(string='Document Background Colour', default='#ffffff')

    @api.constrains('mr_doc_accent_color', 'mr_doc_background_color')
    def _check_mr_doc_colors(self):
        for company in self:
            for value in (company.mr_doc_accent_color, company.mr_doc_background_color):
                if value and not HEX_COLOR_RE.match(value):
                    raise ValidationError(
                        company.env._('Document colours must be written as #RRGGBB, e.g. #4f46e5.')
                    )

    def _mr_doc_style(self):
        self.ensure_one()
        accent = (self.mr_doc_accent_color or self.mt_primary_color or '#4f46e5').strip()
        if self.mr_doc_background == 'custom':
            background = (self.mr_doc_background_color or '#ffffff').strip()
        elif self.mr_doc_background == 'tint':
            background = _mix_colors(accent, '#ffffff', 0.08)
        else:
            background = '#ffffff'
        return {
            'accent': accent,
            'accent_soft': _mix_colors(accent, '#ffffff', 0.12),
            'background': background,
            'border': '#e2e8f0',
            'muted': '#64748b',
            'text': '#0f172a',
        }

    def _mr_address_line(self):
        self.ensure_one()
        parts = [self.street, self.street2, self.city, self.zip, self.country_id.name]
        return ', '.join(part for part in parts if part)

    def _mr_footer_line(self):
        self.ensure_one()
        parts = [self.name, self._mr_address_line(), self.vat, self.company_registry]
        return ' · '.join(part for part in parts if part)
