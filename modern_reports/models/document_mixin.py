from markupsafe import Markup, escape

from odoo import models
from odoo.tools import format_date, html2plaintext
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

    Each document model implements `_mr_values(**options)` and calls `_mr_base_values()` for the
    parts every document shares (company header, lines, totals, words, payment methods).
    """
    _name = 'modern.reports.document'
    _description = 'Modern Reports printable document'

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
    def _mr_text_lines(*html_values):
        lines = []
        for value in html_values:
            text = html2plaintext(value or '') if value else ''
            lines += [line.strip(' -•*\t') for line in text.splitlines() if line.strip(' -•*\t')]
        return lines

    # ---- parties ----------------------------------------------------------

    def _mr_vat_label(self, partner):
        country = partner.country_id or self.company_id.account_fiscal_country_id
        return country.vat_label or self.env._('Tax ID')

    def _mr_address(self, partner):
        city = '-'.join(part for part in (partner.city, partner.zip) if part)
        parts = [partner.street, partner.street2, city, partner.state_id.name]
        if partner.country_id and partner.country_id != self.company_id.country_id:
            parts.append(partner.country_id.name)
        return ', '.join(part for part in parts if part)

    def _mr_company_values(self):
        company = self.company_id
        partner = company.partner_id
        words = [w for w in (company.name or '').replace('.', ' ').split() if w[:1].isalnum()]
        monogram = ''.join(w[0] for w in words[:2]).upper() or '?'
        return {
            'record': company,
            'name': company.name,
            'logo': company.logo if company.logo and not company.uses_default_logo else False,
            'monogram': monogram,
            'address': self._mr_address(partner),
            'contact': ' · '.join(part for part in (company.phone, company.email) if part),
            'vat': company.vat and '%s: %s' % (self._mr_vat_label(partner), company.vat) or '',
            'registry': company.company_registry or '',
        }

    def _mr_party_values(self, partner, label, shipping=None):
        commercial = partner.commercial_partner_id
        name = partner.name if partner == commercial or not partner.name else (
            '%s, %s' % (commercial.name, partner.name))
        contact = ' · '.join(part for part in (self._mr_address(partner), partner.phone) if part)
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

    def _mr_line_values(self, lines, qty_field, show_prices=True):
        result = []
        number = 0
        for line in lines:
            display_type = line.display_type or 'product'
            if display_type in SECTION_TYPES or display_type == 'line_note':
                result.append({'type': 'section' if display_type in SECTION_TYPES else 'note',
                               'name': line.name or ''})
                continue
            if display_type != 'product':
                continue
            number += 1
            text = (line.name or line.product_id.display_name or '').strip().splitlines()
            title = text[0] if text else ''
            extra = ' '.join(part.strip() for part in text[1:] if part.strip())
            taxes = line.tax_ids
            result.append({
                'type': 'product',
                'number': number,
                'title': title,
                'extra': extra,
                'qty': '%s %s' % (self._mr_number(line[qty_field], 'Product Unit'),
                                  line.product_uom_id.name or ''),
                'price': self._mr_number(line.price_unit) if show_prices else '',
                'discount': line.discount,
                'discount_str': self._mr_number(line.discount, 'Discount'),
                'taxes': ', '.join(tax.tax_label or tax.name for tax in taxes),
                'amount': self._mr_money(line.price_subtotal) if show_prices else '',
            })
        return result

    # ---- totals -----------------------------------------------------------

    def _mr_totals_values(self):
        totals = self.tax_totals or {}
        rows = []
        for subtotal in totals.get('subtotals', []):
            rows.append((subtotal.get('name') or self.env._('Untaxed Amount'),
                         self._mr_money(subtotal.get('base_amount_currency', 0.0))))
            for group in subtotal.get('tax_groups') or []:
                rows.append((group.get('group_name', ''),
                             self._mr_money(group.get('tax_amount_currency', 0.0))))
        if 'cash_rounding_base_amount_currency' in totals:
            rows.append((self.env._('Rounding'),
                         self._mr_money(totals['cash_rounding_base_amount_currency'])))
        return rows, self._mr_money(totals.get('total_amount_currency', self.amount_total))

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

    def _mr_payment_methods(self):
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
        return [{
            'kind': 'bank',
            'name': self.env._('Bank Transfer'),
            'detail': bank.bank_id.name or bank.partner_id.name or '',
            'value': bank.acc_number,
            'highlight': index == 0,
        } for index, bank in enumerate(company.partner_id.bank_ids)]

    # ---- assembly ---------------------------------------------------------

    def _mr_base_values(self):
        style = self.company_id._mr_style()
        return {
            'doc': self,
            'style': style,
            'company': self._mr_company_values(),
            'show_prices': True,
            'payments': [],
            'amount_due': '',
            'payment_methods': [],
            'payment_reference': '',
            'terms': [],
        }

    def _mr_finish(self, values):
        lines = values['lines']
        values['show_discount'] = values['show_prices'] and any(
            line['type'] == 'product' and line['discount'] for line in lines)
        values['show_taxes'] = values['show_prices'] and any(
            line['type'] == 'product' and line['taxes'] for line in lines)
        values['payment_method_rows'] = [
            values['payment_methods'][index:index + 3]
            for index in range(0, len(values['payment_methods']), 3)
        ]
        return values

    def _mr_values(self, **options):
        raise NotImplementedError
