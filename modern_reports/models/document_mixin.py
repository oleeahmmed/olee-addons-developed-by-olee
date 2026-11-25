from markupsafe import Markup, escape

from odoo import models
from odoo.addons.base.models.report_paperformat import PAPER_SIZES
from odoo.tools import format_date, html2plaintext, is_html_empty
from odoo.tools.misc import formatLang

from .amount_words import LAKH_CURRENCIES, lakh_amount_words

SECTION_TYPES = ('line_section', 'line_subsection')

TAKA_SVG = Markup(
    '<svg class="o_mr_taka" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 16" width="7" height="9" '
    'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M2.1 2.9C2.1 1.3 4.5 1.1 4.5 2.9V11.1C4.5 14.6 9.9 14.7 9.9 11.1C9.9 9.7 8.6 9.1 7.5 9.5"/>'
    '<path d="M1.4 6.1H9.6"/></svg>'
)


class ModernReportsDocument(models.AbstractModel):
    """Builds the plain values the shared `modern_reports.document` template prints.

    Each document model implements `_mr_values(**options)`, starting from `_mr_base_values()` and
    ending with `_mr_finish()`; the template itself contains no business logic.
    """
    _name = 'modern.reports.document'
    _description = 'Modern Reports printable document'

    # ---- hooks ------------------------------------------------------------

    def _mr_report_xmlid(self):
        """Print action whose paper format the document is printed on."""
        return False

    def _mr_values(self, **options):
        raise NotImplementedError

    # ---- formatting -------------------------------------------------------

    def _mr_money(self, amount, currency=None):
        currency = currency or self.currency_id
        text = escape(formatLang(self.env, amount, currency_obj=currency))
        symbol = escape(currency.symbol or '')
        if not symbol or symbol.isascii():
            return text
        if symbol == '৳':
            # wkhtmltopdf has no font with the Taka sign: draw it.
            glyph = TAKA_SVG
        else:
            glyph = Markup('<span class="o_mr_cur">%s</span>') % symbol
        return Markup(text.replace(symbol, glyph))

    def _mr_number(self, value, digits='Product Price'):
        return formatLang(self.env, value, dp=digits)

    def _mr_date(self, value):
        return format_date(self.env, value) if value else ''

    @staticmethod
    def _mr_rows(*rows):
        """Keep (label, value) pairs that have a value."""
        return [(label, value) for label, value in rows if value]

    @staticmethod
    def _mr_plain(html):
        return '' if is_html_empty(html) else html2plaintext(html).strip()

    @classmethod
    def _mr_text_lines(cls, *html_values):
        lines = []
        for value in html_values:
            text = cls._mr_plain(value) if value else ''
            lines += [line.strip(' -•*\t') for line in text.splitlines() if line.strip(' -•*\t')]
        return lines

    # ---- company / parties ------------------------------------------------

    def _mr_vat_label(self, partner):
        country = partner.country_id or self.company_id.account_fiscal_country_id
        return country.vat_label or self.env._('Tax ID')

    def _mr_address(self, partner):
        city = '-'.join(part for part in (partner.city, partner.zip) if part)
        parts = [partner.street, partner.street2, city, partner.state_id.name]
        if partner.country_id and partner.country_id != self.company_id.country_id:
            parts.append(partner.country_id.name)
        return ', '.join(part for part in parts if part)

    def _mr_company_values(self, forced_vat=False):
        company = self.company_id
        partner = company.partner_id
        words = [w for w in (company.name or '').replace('.', ' ').split() if w[:1].isalnum()]
        monogram = ''.join(w[0] for w in words[:2]).upper() or '?'
        vat = forced_vat or company.vat
        return {
            'record': company,
            'name': company.name,
            'tagline': self._mr_plain(company.report_header),
            'logo': company.logo if company.logo and not company.uses_default_logo else False,
            'monogram': monogram,
            'address': self._mr_address(partner),
            'contact': ' · '.join(part for part in (company.phone, company.email, company.website) if part),
            'vat': vat and '%s: %s' % (self._mr_vat_label(partner), vat) or '',
            'registry': company.company_registry or '',
        }

    def _mr_party_values(self, partner, label, shipping=None):
        commercial = partner.commercial_partner_id
        name = partner.name if partner == commercial or not partner.name else (
            '%s, %s' % (commercial.name, partner.name))
        contact = ' · '.join(part for part in (self._mr_address(partner), partner.phone, partner.email) if part)
        ship_to = ''
        if shipping and shipping != partner:
            ship_to = ' · '.join(part for part in (shipping.name, self._mr_address(shipping)) if part)
        return {
            'label': label,
            'name': name,
            'contact': contact,
            'vat_label': self._mr_vat_label(commercial),
            'vat': commercial.vat or '',
            'ship_to': ship_to,
        }

    # ---- lines ------------------------------------------------------------

    def _mr_price_field(self):
        return 'price_total' if self.company_price_include == 'tax_included' else 'price_subtotal'

    def _mr_qty(self, quantity, uom=None):
        text = self._mr_number(quantity, 'Product Unit')
        if uom and self.env.user.has_group('uom.group_uom'):
            text = '%s %s' % (text, uom.name)
        return text

    @staticmethod
    def _mr_split_name(name):
        text = (name or '').strip().splitlines()
        title = text[0] if text else ''
        extra = ' '.join(part.strip() for part in text[1:] if part.strip())
        return title, extra

    def _mr_product_row(self, line, quantity, hide_prices=False, hide_amount=False, indent=0):
        title, extra = self._mr_split_name(line.name or line.product_id.display_name)
        price_unit, discount = line.price_unit, line.discount
        if discount < 0:
            # Odoo prints surcharges as a higher unit price, not as a negative discount
            price_unit, discount = price_unit * (1 - discount / 100.0), 0.0
        return {
            'type': 'product',
            'title': title,
            'extra': extra,
            'indent': indent,
            'qty': self._mr_qty(quantity, line.product_uom_id),
            'price': '' if hide_prices else self._mr_number(price_unit),
            'discount': 0.0 if hide_prices else discount,
            'discount_str': '' if hide_prices or not discount else self._mr_number(discount, 'Discount'),
            'taxes': '' if hide_prices else ', '.join(t.tax_label for t in line.tax_ids if t.tax_label),
            'amount': '' if hide_prices or hide_amount else self._mr_money(line[self._mr_price_field()]),
        }

    def _mr_section_row(self, name, amount=None, subsection=False):
        return {
            'type': 'subsection' if subsection else 'section',
            'name': name or '',
            'amount': '' if amount is None else self._mr_money(amount),
        }

    @staticmethod
    def _mr_note_row(name, indent=0):
        return {'type': 'note', 'name': name or '', 'indent': indent}

    # ---- totals -----------------------------------------------------------

    def _mr_tax_rows(self, totals, currency, suffix='_currency'):
        rows = []
        same_base = totals.get('same_tax_base', True)
        for subtotal in totals.get('subtotals', []):
            if subtotal.get('tax_groups'):
                rows.append((subtotal.get('name') or self.env._('Untaxed Amount'),
                             self._mr_money(subtotal.get('base_amount' + suffix, 0.0), currency)))
            for group in subtotal.get('tax_groups') or []:
                label = group.get('group_name', '')
                base = group.get('display_base_amount' + suffix)
                if not same_base and base is not False and base is not None:
                    label = Markup('%s <span class="o_mr_muted">on %s</span>') % (
                        label, self._mr_money(base, currency))
                rows.append((label, self._mr_money(group.get('tax_amount' + suffix, 0.0), currency)))
        if suffix == '_currency' and 'cash_rounding_base_amount_currency' in totals:
            rows.append((self.env._('Rounding'),
                         self._mr_money(totals['cash_rounding_base_amount_currency'], currency)))
        return rows

    def _mr_totals_values(self, values):
        totals = self.tax_totals or {}
        values['totals'] = self._mr_tax_rows(totals, self.currency_id)
        values['total'] = self._mr_money(totals.get('total_amount_currency', self.amount_total))
        if totals.get('display_in_company_currency'):
            company_currency = self.company_id.currency_id
            values['company_totals'] = {
                'title': self.env._('Taxes in %s', company_currency.name),
                'rows': self._mr_tax_rows(totals, company_currency, suffix=''),
                'total': self._mr_money(totals.get('total_amount', 0.0), company_currency),
            }

    def _mr_amount_words(self, amount):
        currency = self.currency_id
        if not currency or not amount:
            return ''
        if currency.name in LAKH_CURRENCIES:
            text = lakh_amount_words(amount, currency.currency_unit_label or currency.name,
                                     currency.currency_subunit_label or '', currency.decimal_places)
        else:
            text = currency.amount_to_text(abs(amount))
        return self.env._('%s Only.', text)

    # ---- payment methods --------------------------------------------------

    def _mr_payment_methods(self, bank_account=None):
        company = self.company_id
        methods = company.mr_payment_method_ids.filtered('active')
        if methods:
            return [{
                'kind': method.kind,
                'name': method.name,
                'detail': method.detail or '',
                'value': method.value or '',
                'highlight': method.highlight,
            } for method in methods]
        banks = bank_account or company.partner_id.bank_ids
        return [{
            'kind': 'bank',
            'name': self.env._('Bank Transfer'),
            'detail': bank.bank_id.name or bank.partner_id.name or '',
            'value': bank.acc_number,
            'highlight': index == 0,
        } for index, bank in enumerate(banks[:3])]

    # ---- page -------------------------------------------------------------

    def _mr_page_values(self):
        """Printable area in mm, used by the page-filling script."""
        report = self._mr_report_xmlid() and self.env.ref(self._mr_report_xmlid(), raise_if_not_found=False)
        paper = report.get_paperformat() if report else self.company_id.paperformat_id
        if not paper or not paper.disable_shrinking:
            # with smart shrinking the CSS px -> paper scale is unknown: no page filling
            return {'width': 0, 'height': 0}
        if paper.format == 'custom' and paper.page_width and paper.page_height:
            width, height = paper.page_width, paper.page_height
        else:
            size = next((s for s in PAPER_SIZES if s['key'] == paper.format), {'width': 210, 'height': 297})
            width, height = size['width'], size['height']
        if paper.orientation == 'Landscape':
            width, height = height, width
        return {
            'width': round(width - paper.margin_left - paper.margin_right, 2),
            'height': round(height - paper.margin_top - paper.margin_bottom, 2),
        }

    # ---- assembly ---------------------------------------------------------

    def _mr_base_values(self):
        company = self.company_id
        return {
            'doc': self,
            'style': company._mr_style(),
            'company': self._mr_company_values(),
            'page': self._mr_page_values(),
            'show_prices': True,
            # quantity column header, and an optional second quantity column (e.g. Delivered)
            'qty_label': self.env._('Quantity'),
            'qty2_label': '',
            'totals': [],
            'total': '',
            'company_totals': None,
            'payments': [],
            'amount_due': '',
            'words': '',
            'payment_methods': [],
            'payment_reference': '',
            'bank_account': '',
            'qr_codes': [],
            'schedule': [],
            'notes': [],
            'terms': [],
            'customer_signature': None,
            'footer_text': self._mr_plain(company.report_footer).replace('\n', ' · '),
        }

    def _mr_finish(self, values):
        style = values['style']
        if not style['amount_words']:
            values['words'] = ''
        if not style['payment_methods']:
            values['payment_methods'] = []
        values['show_numbers'] = style['line_numbers']
        rows = values['lines']
        number = 0
        for row in rows:
            if row['type'] == 'product':
                number += 1
                row['number'] = number
        products = [row for row in rows if row['type'] == 'product']
        values['show_discount'] = values['show_prices'] and any(row['discount'] for row in products)
        values['show_taxes'] = values['show_prices'] and any(row['taxes'] for row in products)
        values['columns'] = (
            values['show_numbers'] + 2 + bool(values['qty2_label'])
            + (2 if values['show_prices'] else 0) + values['show_discount'] + values['show_taxes']
        )
        # cells a section / note row spans after the optional "#" cell
        values['section_span'] = values['columns'] - values['show_numbers'] - (1 if values['show_prices'] else 0)
        values['note_span'] = values['columns'] - values['show_numbers']
        stripe = style['stripe_style']
        for row in products:
            row['style'] = stripe if stripe and row['number'] % 2 == 0 else None
            row.setdefault('qty2', '')
        values['payment_method_rows'] = [
            values['payment_methods'][index:index + 3]
            for index in range(0, len(values['payment_methods']), 3)
        ]
        values['has_left'] = bool(values['payment_methods'] or values['payment_reference'] or values['qr_codes']
                                  or values['schedule'] or values['notes'] or values['terms'])
        return values
