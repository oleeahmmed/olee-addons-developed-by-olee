import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError

HEX_COLOR_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}){1,2}$')
DEFAULT_ACCENT = '#714B67'

# Fonts of Odoo's document layout (res.company.font) -> CSS class of the matching
# `MR <font>` family declared in modern_reports.scss.
DOCUMENT_FONTS = ('Lato', 'Roboto', 'Open_Sans', 'Montserrat', 'Oswald', 'Raleway', 'Tajawal', 'Fira_Mono')


def _hex_to_rgb(value):
    value = value.strip().lstrip('#')
    if len(value) == 3:
        value = ''.join(char * 2 for char in value)
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def mix_colors(foreground, background, weight):
    fg, bg = _hex_to_rgb(foreground), _hex_to_rgb(background)
    return '#%02x%02x%02x' % tuple(round(fg[i] * weight + bg[i] * (1 - weight)) for i in range(3))


def _luminance(color):
    def channel(value):
        value /= 255
        return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in _hex_to_rgb(color))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def readable_on(color):
    """Text colour (white or near-black) that reads on `color`."""
    return '#ffffff' if _luminance(color) < 0.45 else '#09090b'


def _valid(color):
    return color if color and HEX_COLOR_RE.match(color.strip()) else False


class ResCompany(models.Model):
    _inherit = 'res.company'

    mr_color_source = fields.Selection(
        [('document', 'Odoo document layout'), ('theme', 'Modern Theme'), ('custom', 'Custom colour')],
        string='Document Colours', default='document', required=True,
        help='Odoo document layout: the primary / secondary colours of Settings > Document Layout.\n'
             'Modern Theme: the brand colour of the Modern Theme app (when installed).\n'
             'Custom colour: the accent colour below.',
    )
    mr_accent_color = fields.Char(string='Document Accent Colour', default=DEFAULT_ACCENT)
    mr_background = fields.Selection(
        [('document', 'Odoo document layout'), ('white', 'White'), ('tint', 'Soft accent tint')],
        string='Document Background', default='document', required=True,
        help='Odoo document layout: the background chosen in Settings > Document Layout '
             '(blank, demo logo or a custom image).',
    )
    mr_fill_page = fields.Boolean(
        string='Fill Page with Item Rows', default=True,
        help='Pad the item table with empty rows so the totals and signatures always sit at the '
             'bottom of the last page.',
    )
    mr_show_signatures = fields.Boolean(string='Print Signature Lines', default=True)

    # ---- design options ---------------------------------------------------
    mr_table_style = fields.Selection(
        [('rows', 'Row lines'), ('grid', 'All borders'), ('striped', 'Striped rows'), ('minimal', 'Minimal')],
        string='Item Table Borders', default='rows', required=True,
        help='Row lines: a line under every row.\n'
             'All borders: every cell boxed.\n'
             'Striped rows: alternate rows tinted, no lines.\n'
             'Minimal: only the header line.',
    )
    mr_table_header = fields.Selection(
        [('tint', 'Soft tint'), ('solid', 'Solid colour'), ('plain', 'Plain, underlined')],
        string='Item Table Header', default='tint', required=True,
    )
    mr_title_style = fields.Selection(
        [('band', 'Solid band'), ('soft', 'Soft band'), ('plain', 'Plain title')],
        string='Document Title', default='band', required=True,
    )
    mr_density = fields.Selection(
        [('compact', 'Compact'), ('normal', 'Normal'), ('comfortable', 'Comfortable')],
        string='Row Spacing', default='normal', required=True,
    )
    mr_font_size = fields.Selection(
        [('small', 'Small'), ('normal', 'Normal'), ('large', 'Large')],
        string='Text Size', default='normal', required=True,
    )
    mr_frame = fields.Boolean(string='Frame Around the Page', default=True)
    mr_show_line_numbers = fields.Boolean(string='Line Numbers', default=True)
    mr_show_amount_words = fields.Boolean(string='Amount in Words', default=True)
    mr_show_payment_methods = fields.Boolean(string='Payment Method Cards', default=True)
    mr_payment_method_ids = fields.One2many('modern.reports.payment.method', 'company_id')

    @api.constrains('mr_accent_color')
    def _check_mr_accent_color(self):
        for company in self:
            if company.mr_accent_color and not _valid(company.mr_accent_color):
                raise ValidationError(self.env._('The document accent colour must look like #714B67.'))

    def _mr_theme_color(self):
        """Brand colour of the Modern Theme app, if it is installed."""
        if 'mt_preset' not in self._fields:
            return False
        if self.mt_preset == 'custom':
            return _valid(self.mt_primary_color)
        try:
            from odoo.addons.modern_theme.models.theme_options import PRESET_SWATCHES  # noqa: PLC0415
        except ImportError:
            return False
        return PRESET_SWATCHES.get(self.mt_preset) or _valid(self.mt_primary_color)

    def _mr_colors(self):
        self.ensure_one()
        source = self.mr_color_source
        primary = secondary = False
        if source == 'theme':
            primary = self._mr_theme_color()
            secondary = _valid(self.mt_accent_color) if 'mt_accent_color' in self._fields else False
        elif source == 'document':
            primary = _valid(self.primary_color)
            secondary = _valid(self.secondary_color)
        primary = primary or _valid(self.mr_accent_color) or DEFAULT_ACCENT
        return primary.strip(), (secondary or primary).strip()

    def _mr_background_values(self):
        """(css style, extra class) for the printed page background."""
        self.ensure_one()
        accent = self._mr_colors()[0]
        if self.mr_background == 'tint':
            return 'background-color: %s;' % mix_colors(accent, '#ffffff', 0.04), ''
        if self.mr_background == 'document' and self.layout_background != 'Blank':
            if self.layout_background == 'Custom' and self.layout_background_image:
                url = 'data:image/png;base64,%s' % self.layout_background_image.decode()
            elif self.layout_background == 'Demo logo':
                url = '/base/static/img/demo_logo_report.png'
            else:
                return '', ''
            return 'background-image: url(%s);' % url, 'o_mr_has_bg'
        return '', ''

    def _mr_style(self):
        self.ensure_one()
        accent, secondary = self._mr_colors()
        background, background_class = self._mr_background_values()
        font = self.font if self.font in DOCUMENT_FONTS else 'Roboto'
        soft = mix_colors(accent, '#ffffff', 0.07)
        on_accent = readable_on(accent)
        caption = secondary if _luminance(secondary) < 0.55 else accent
        # item table header row (tr) and cells (th): wkhtmltopdf has no CSS variables, so the
        # accent-dependent parts are inlined
        header = self.mr_table_header
        if header == 'solid':
            thead_style, th_style = 'background-color: %s; color: %s;' % (accent, on_accent), ''
        elif header == 'plain':
            thead_style, th_style = 'color: %s;' % caption, 'border-bottom: 1.5px solid %s;' % accent
        else:
            thead_style, th_style = 'background-color: %s; color: %s;' % (soft, caption), ''
        title = self.mr_title_style
        if title == 'soft':
            band_style = 'background-color: %s; color: %s;' % (soft, accent)
        elif title == 'plain':
            band_style = 'color: %s;' % accent
        else:
            band_style = 'background-color: %s; color: %s;' % (accent, on_accent)
        classes = ' '.join([
            'o_mr_tbl_%s' % self.mr_table_style,
            'o_mr_head_%s' % header,
            'o_mr_title_%s' % title,
            'o_mr_density_%s' % self.mr_density,
            'o_mr_fs_%s' % self.mr_font_size,
            '' if self.mr_frame else 'o_mr_noframe',
        ]).strip()
        return {
            'accent': accent,
            'on_accent': on_accent,
            # captions / table head text: the secondary colour when it is dark enough to read
            'caption': caption,
            'soft': soft,
            'soft_border': mix_colors(accent, '#ffffff', 0.4),
            'background': background,
            'background_class': background_class,
            'font_class': 'o_mr_font_%s' % font,
            'fill_page': self.mr_fill_page,
            'signatures': self.mr_show_signatures,
            # design options
            'classes': classes,
            'thead_style': thead_style,
            'th_style': th_style or None,
            'band_style': band_style,
            # striped rows: every other item row tinted with the accent
            'stripe_style': 'background-color: %s;' % mix_colors(accent, '#ffffff', 0.045)
                            if self.mr_table_style == 'striped' else '',
            'line_numbers': self.mr_show_line_numbers,
            'amount_words': self.mr_show_amount_words,
            'payment_methods': self.mr_show_payment_methods,
        }
