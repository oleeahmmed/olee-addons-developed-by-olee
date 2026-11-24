# Modern Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `modern_reports` Odoo 19 addon: one modern print layout (logo | company | copy labels, accent band, meta grid, parties, per-tax item table, Odoo-computed totals, bank/terms/signature) for invoices, invoice proformas, sales orders and purchase orders, with per-company accent/background and no "Powered by".

**Architecture:** The addon ships its own document and wrapper templates (`modern_reports.report_invoice`, `..._saleorder`, `..._purchaseorder`) and retargets the existing `ir.actions.report` records to them, leaving every core QWeb view untouched. (Modifying `account.report_invoice_document` — even by retargeting its `web.external_layout` call — makes Odoo re-validate sibling primary views such as `account.report_invoice_document_preview` and `account_edi_ubl_cii.report_invoice_document`, which xpath inside that call and then fail.) The page is model-agnostic: it renders chrome (header/band/footer) and dispatches a body partial via `mr_doc._mr_document_kind()`. All data access goes through a shared abstract mixin (`modern.reports.document.mixin`) with per-model hooks. Colours are resolved in Python (`res.company._mr_doc_style()`) and injected as concrete hex inline styles because wkhtmltopdf has no CSS-variable support.

**Tech Stack:** Odoo 19 CE (Python 3.12, QWeb, SCSS in `web.report_assets_common`, wkhtmltopdf), Odoo `TransactionCase` / `AccountTestInvoicingCommon`. No new Python dependencies (`res.currency.amount_to_text` already wraps `num2words`).

**Spec:** `docs/superpowers/specs/2026-11-25-modern-reports-design.md`

## Global Constraints

- Repository: `C:/odoo19/extra-addons` (branch `main`). New addon directory: `C:/odoo19/extra-addons/modern_reports`. Version `19.0.1.0.0`, license `LGPL-3`, author `Olee`, depends `modern_theme`, `account`, `sale`, `purchase`.
- Local environment: DB `odoo_local`, config `C:/odoo19/odoo-local.conf`, Python `C:/odoo19/venv/Scripts/python.exe`, Odoo source `C:/odoo19/odoo-src/odoo-bin`.
- Install / upgrade + tests command (Git Bash):
  `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`
  (first task uses `-i modern_reports`).
- Production writes only after explicit user approval: commit → push `origin main` → `ssh root@72.62.198.140 "bash /var/www/odoo/update.sh"`. Never write directly to production databases. Never store the root SSH password on disk, in memory or on a command line.
- No "Powered by" / "POWERED BY" text and no watermark anywhere in the templates or SCSS.
- wkhtmltopdf limits: tables/floats only (no CSS grid/flex), no CSS custom properties (inject concrete hex), A4 with `.header` / `.footer` repeating blocks and `.page` / `.topage` counters.
- Money/quantities shown in documents come only from Odoo computed values (`tax_totals`, `amount_total`, `amount_tax`, `price_subtotal`, `price_total`, `amount_residual`); QWeb never recomputes document math.
- UI labels are English and wrapped in `self.env._(...)`; user-visible strings must remain translatable.
- `--test-enable` makes `_render_qweb_pdf` fall back to HTML — tests assert on `_render_qweb_html`; real PDF inspection happens only in Task 8 via the Odoo shell.
- Commit after every task; do not push or deploy during this plan.
- Odoo 19 naming facts used throughout: line tax field is `tax_ids` on invoice, sale and purchase lines; UOM field is `product_uom_id`; quantities are `quantity` (invoice), `product_uom_qty` (sale), `product_qty` (purchase); report groups field is `group_ids`; purchase terms field is `note` (Html).

## File Structure

```
modern_reports/
├── __manifest__.py                     # metadata, data list, report asset bundle
├── __init__.py                         # imports models
├── models/
│   ├── __init__.py
│   ├── document_mixin.py               # abstract helpers: lines, taxes, totals, words, meta
│   ├── res_company.py                  # document colour fields, hex constraint, _mr_doc_style()
│   ├── res_config_settings.py          # related settings fields
│   ├── account_move.py                 # hooks: kind, title, lines, terms
│   ├── sale_order.py                   # hooks: kind, title, lines, terms
│   └── purchase_order.py               # hooks: kind, title, lines, terms
├── views/
│   └── res_config_settings_views.xml   # "Documents" block inside the Modern Theme app
├── report/
│   ├── paperformat.xml                 # A4 paperformat for all modern documents
│   ├── document_page.xml               # chrome + items_table + totals_table + bottom_blocks
│   ├── document_invoice.xml            # replaces account.report_invoice_document body
│   ├── document_sale_order.xml         # replaces sale.report_saleorder_document body
│   ├── document_purchase_order.xml     # replaces purchase.report_purchaseorder_document body
│   ├── copy_wrappers.xml               # 6 thin copy/proforma templates
│   └── report_actions.xml              # paperformats on core actions + 6 new print actions
├── static/src/scss/document.scss       # layout/typography only, hex colours injected inline
└── tests/
    ├── __init__.py
    ├── common.py                       # ModernReportTestCommon (doc fixtures + _render)
    ├── test_company_style.py
    ├── test_document_helpers.py
    ├── test_invoice_document.py
    ├── test_document_copies.py
    ├── test_sale_document.py
    └── test_purchase_document.py
```

Responsibilities: `document_mixin.py` owns every cross-model computation (titles stay per model because their rules differ); report XML files own markup only; `document_page.xml` never references model-specific fields — bodies do. `res_company.py` owns colour math so templates only format.

---

### Task 1: Addon scaffold, document colours and Settings block

**Files:**
- Create: `modern_reports/__manifest__.py`
- Create: `modern_reports/__init__.py`
- Create: `modern_reports/models/__init__.py`
- Create: `modern_reports/models/res_company.py`
- Create: `modern_reports/models/res_config_settings.py`
- Create: `modern_reports/views/res_config_settings_views.xml`
- Create: `modern_reports/tests/__init__.py`
- Create: `modern_reports/tests/test_company_style.py`

**Interfaces:**
- Produces: `res.company.mr_doc_accent_color` (Char), `mr_doc_background` (Selection white/tint/custom), `mr_doc_background_color` (Char), `res.company._mr_doc_style() -> dict` with keys `accent, accent_soft, background, border, muted, text` (all hex strings), `res.company._mr_address_line() -> str`, `res.company._mr_footer_line() -> str`.
- Produces: `modern_theme.res_config_settings_view_form` gets a `Documents` block with those three fields (related, readonly=False).

- [ ] **Step 1: Write the failing test and the package skeleton**

`modern_reports/tests/__init__.py`:

```python
from . import test_company_style
```

`modern_reports/tests/test_company_style.py`:

```python
from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase


class TestCompanyStyle(TransactionCase):

    def setUp(self):
        super().setUp()
        self.company = self.env.company

    def test_default_accent_comes_from_theme(self):
        self.company.write({
            'mr_doc_accent_color': False,
            'mt_primary_color': '#123456',
            'mr_doc_background': 'white',
        })
        style = self.company._mr_doc_style()
        self.assertEqual(style['accent'], '#123456')
        self.assertEqual(style['background'], '#ffffff')
        self.assertEqual(style['border'], '#e2e8f0')

    def test_explicit_accent_overrides_theme(self):
        self.company.write({'mr_doc_accent_color': '#0f766e', 'mt_primary_color': '#123456'})
        self.assertEqual(self.company._mr_doc_style()['accent'], '#0f766e')

    def test_tint_background_mixes_accent_with_white(self):
        self.company.write({'mr_doc_accent_color': '#0f766e', 'mr_doc_background': 'tint'})
        self.assertEqual(self.company._mr_doc_style()['background'], '#ecf4f3')

    def test_custom_background_is_used_verbatim(self):
        self.company.write({'mr_doc_background': 'custom', 'mr_doc_background_color': '#f1f5f9'})
        self.assertEqual(self.company._mr_doc_style()['background'], '#f1f5f9')

    def test_invalid_colours_are_rejected(self):
        with self.assertRaises(ValidationError):
            self.company.write({'mr_doc_accent_color': 'teal'})
        with self.assertRaises(ValidationError):
            self.company.write({'mr_doc_background': 'custom', 'mr_doc_background_color': 'white'})

    def test_footer_line_lists_company_address_and_tax(self):
        self.company.write({'name': 'Modern Co', 'street': '1 Main Road', 'city': 'Dhaka', 'vat': 'VAT123'})
        footer = self.company._mr_footer_line()
        self.assertIn('Modern Co', footer)
        self.assertIn('1 Main Road', footer)
        self.assertIn('VAT123', footer)
```

`modern_reports/__init__.py`:

```python
from . import models
```

`modern_reports/models/__init__.py`:

```python
```
(empty file)

`modern_reports/__manifest__.py` (skeleton — data/assets are added in the step below):

```python
{
    'name': 'Modern Reports',
    'summary': 'Modern printed documents for invoices, proformas, sales orders and purchase orders',
    'version': '19.0.1.0.0',
    'category': 'Sales/Sales',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'account', 'sale', 'purchase'],
    'data': [],
    'installable': True,
    'application': False,
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -i modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: module installs, tests FAIL with `AttributeError: 'res.company' object has no attribute '_mr_doc_style'`.

- [ ] **Step 3: Implement the company fields, style helper and settings UI**

`modern_reports/models/res_company.py`:

```python
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
```

`modern_reports/models/res_config_settings.py`:

```python
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    mr_doc_accent_color = fields.Char(
        related='company_id.mr_doc_accent_color', readonly=False,
    )
    mr_doc_background = fields.Selection(
        related='company_id.mr_doc_background', readonly=False,
    )
    mr_doc_background_color = fields.Char(
        related='company_id.mr_doc_background_color', readonly=False,
    )
```

`modern_reports/models/__init__.py`:

```python
from . import res_company
from . import res_config_settings
```

`modern_reports/views/res_config_settings_views.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <record id="res_config_settings_view_form" model="ir.ui.view">
        <field name="name">res.config.settings.view.form.inherit.modern.reports</field>
        <field name="model">res.config.settings</field>
        <field name="inherit_id" ref="modern_theme.res_config_settings_view_form"/>
        <field name="arch" type="xml">
            <xpath expr="//app[@name='modern_theme']" position="inside">
                <block title="Documents" name="mr_documents">
                    <setting id="mr_doc_accent_color" string="Document accent colour"
                             help="Leave empty to use the brand colour. Used for the title band, table headers and accents on printed documents.">
                        <field name="mr_doc_accent_color" widget="color" class="mt-color-field"/>
                    </setting>
                    <setting id="mr_doc_background" string="Document background"
                             help="White, a soft tint of the accent colour, or a custom colour.">
                        <field name="mr_doc_background"/>
                        <div class="mt-setting-row" invisible="mr_doc_background != 'custom'">
                            <field name="mr_doc_background_color" widget="color" class="mt-color-field"/>
                        </div>
                    </setting>
                </block>
            </xpath>
        </field>
    </record>

</odoo>
```

Replace `modern_reports/__manifest__.py` with:

```python
{
    'name': 'Modern Reports',
    'summary': 'Modern printed documents for invoices, proformas, sales orders and purchase orders',
    'description': """
Modern print design shared by invoices, proforma invoices, sales orders and purchase orders:
logo / company / copy-label letterhead, accent title band, meta grid, parties, per-tax item
columns, totals from Odoo's computed amounts, bank details, terms and signature.

Accent colour and page background follow the Modern Theme brand colour and can be overridden
per company in Settings > Modern Theme > Documents.
    """,
    'version': '19.0.1.0.0',
    'category': 'Sales/Sales',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'account', 'sale', 'purchase'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'installable': True,
    'application': False,
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `0 failed, 0 error(s)` (6 tests in `TestCompanyStyle`).

- [ ] **Step 5: Commit**

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "feat(modern_reports): scaffold addon with document colour settings"
```

---

### Task 2: Shared document helpers and per-model titles

**Files:**
- Create: `modern_reports/models/document_mixin.py`
- Create: `modern_reports/models/account_move.py`
- Create: `modern_reports/models/sale_order.py`
- Create: `modern_reports/models/purchase_order.py`
- Modify: `modern_reports/models/__init__.py`
- Create: `modern_reports/tests/common.py`
- Create: `modern_reports/tests/test_document_helpers.py`
- Modify: `modern_reports/tests/__init__.py`

**Interfaces:**
- Consumes: `res.company._mr_doc_style()` from Task 1 (not called here).
- Produces (on invoice, sale order and purchase order records): `_mr_document_kind() -> str`, `_mr_document_title(proforma=False) -> str`, `_mr_partner() -> record`, `_mr_company() -> res.company`, `_mr_lines() -> recordset`, `_mr_line_description(line)`, `_mr_line_qty(line) -> float`, `_mr_line_uom_name(line) -> str`, `_mr_line_price(line) -> float`, `_mr_line_amount(line) -> float`, `_mr_line_discount(line) -> float`, `_mr_line_subtotal(line)`, `_mr_line_total(line)`, `_mr_line_taxes(line) -> account.tax recordset`, `_mr_line_hsn(line) -> str`, `_mr_has_discount() -> bool`, `_mr_has_hsn() -> bool`, `_mr_tax_columns() -> list[dict(id, name, sequence)]`, `_mr_line_tax_rate(line, group_id) -> float`, `_mr_line_tax_amount(line, group_id) -> float`, `_mr_totals_rows() -> list[dict(kind, label, amount, base)]`, `_mr_total() -> float`, `_mr_amount_in_words() -> str`, `_mr_optional_meta() -> list[dict(label, value)]`, `_mr_terms_text() -> str`.
- Produces (test scaffold): `ModernReportTestCommon` with `self.tax_sale`, `self.tax_purchase`, `self.product`, `self.vendor`, and methods `_create_invoice(move_type='out_invoice', post=True, discount=0.0)`, `_create_sale_order(confirm=False)`, `_create_purchase_order(confirm=False)`, `_render(report_ref, records) -> str`.

- [ ] **Step 1: Write the failing test**

`modern_reports/tests/common.py`:

```python
from odoo import fields
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


class ModernReportTestCommon(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company
        cls.company.write({
            'mt_primary_color': '#0f766e',
            'mr_doc_accent_color': False,
            'mr_doc_background': 'white',
            'mr_doc_background_color': '#ffffff',
        })
        cls.tax_sale = cls.env['account.tax'].create({
            'name': 'GST 12%',
            'amount': 12.0,
            'amount_type': 'percent',
            'type_tax_use': 'sale',
        })
        cls.tax_purchase = cls.env['account.tax'].create({
            'name': 'VAT 12%',
            'amount': 12.0,
            'amount_type': 'percent',
            'type_tax_use': 'purchase',
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Modern Widget',
            'list_price': 100.0,
        })
        cls.vendor = cls.env['res.partner'].create({
            'name': 'Modern Vendor',
            'supplier_rank': 1,
        })

    def _create_invoice(self, move_type='out_invoice', post=True, discount=0.0):
        is_vendor = move_type in ('in_invoice', 'in_refund')
        move = self.env['account.move'].create({
            'move_type': move_type,
            'partner_id': (self.vendor if is_vendor else self.partner_a).id,
            'invoice_date': fields.Date.today(),
            'invoice_line_ids': [(0, 0, {
                'name': 'Modern Widget',
                'product_id': self.product.id,
                'quantity': 2.0,
                'price_unit': 100.0,
                'discount': discount,
                'tax_ids': [(6, 0, (self.tax_purchase if is_vendor else self.tax_sale).ids)],
            })],
        })
        if post:
            move.action_post()
        return move

    def _create_sale_order(self, confirm=False):
        order = self.env['sale.order'].create({
            'partner_id': self.partner_a.id,
            'order_line': [(0, 0, {
                'product_id': self.product.id,
                'product_uom_qty': 2.0,
                'price_unit': 100.0,
                'tax_ids': [(6, 0, self.tax_sale.ids)],
            })],
        })
        if confirm:
            order.action_confirm()
        return order

    def _create_purchase_order(self, confirm=False):
        order = self.env['purchase.order'].create({
            'partner_id': self.vendor.id,
            'order_line': [(0, 0, {
                'product_id': self.product.id,
                'product_qty': 2.0,
                'price_unit': 100.0,
                'date_planned': fields.Datetime.now(),
                'tax_ids': [(6, 0, self.tax_purchase.ids)],
            })],
        })
        if confirm:
            order.button_confirm()
        return order

    def _render(self, report_ref, records):
        html, _report_type = self.env['ir.actions.report']._render_qweb_html(report_ref, records.ids)
        return html.decode() if isinstance(html, bytes) else html
```

`modern_reports/tests/__init__.py`:

```python
from . import test_company_style
from . import test_document_helpers
```

`modern_reports/tests/test_document_helpers.py`:

```python
from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestDocumentHelpers(ModernReportTestCommon):

    def test_invoice_titles(self):
        draft = self._create_invoice(post=False)
        self.assertEqual(draft._mr_document_title(), 'Draft Invoice')
        posted = self._create_invoice()
        self.assertEqual(posted._mr_document_title(), 'Invoice')
        self.assertEqual(posted._mr_document_title(proforma=True), 'Proforma Invoice')
        refund = self._create_invoice(move_type='out_refund')
        self.assertEqual(refund._mr_document_title(), 'Credit Note')
        bill = self._create_invoice(move_type='in_invoice')
        self.assertEqual(bill._mr_document_title(), 'Vendor Bill')
        vendor_credit = self._create_invoice(move_type='in_refund')
        self.assertEqual(vendor_credit._mr_document_title(), 'Vendor Credit Note')
        cancelled = self._create_invoice(post=False)
        cancelled.button_cancel()
        self.assertEqual(cancelled._mr_document_title(), 'Cancelled Invoice')

    def test_sale_titles(self):
        quotation = self._create_sale_order()
        self.assertEqual(quotation._mr_document_title(), 'Quotation')
        order = self._create_sale_order(confirm=True)
        self.assertEqual(order._mr_document_title(), 'Sales Order')
        self.assertEqual(order.with_context(proforma=True)._mr_document_title(), 'Pro-Forma Invoice')

    def test_purchase_titles(self):
        rfq = self._create_purchase_order()
        self.assertEqual(rfq._mr_document_title(), 'Request for Quotation')
        order = self._create_purchase_order(confirm=True)
        self.assertEqual(order._mr_document_title(), 'Purchase Order')
        cancelled = self._create_purchase_order()
        cancelled.button_cancel()
        self.assertEqual(cancelled._mr_document_title(), 'Cancelled Purchase Order')

    def test_tax_columns_and_per_line_amounts(self):
        invoice = self._create_invoice()
        columns = invoice._mr_tax_columns()
        self.assertEqual(len(columns), 1)
        group_id = columns[0]['id']
        lines = invoice._mr_lines()
        self.assertEqual(len(lines), 1)
        self.assertAlmostEqual(invoice._mr_line_tax_rate(lines, group_id), 12.0)
        self.assertAlmostEqual(invoice._mr_line_tax_amount(lines, group_id), 24.0)

    def test_totals_rows_and_total(self):
        invoice = self._create_invoice()
        self.assertAlmostEqual(invoice._mr_total(), 224.0)
        rows = invoice._mr_totals_rows()
        kinds = [row['kind'] for row in rows]
        self.assertIn('subtotal', kinds)
        self.assertIn('tax', kinds)
        self.assertIn('total_tax', kinds)
        tax_row = next(row for row in rows if row['kind'] == 'tax')
        self.assertAlmostEqual(tax_row['amount'], 24.0)

    def test_amount_in_words(self):
        invoice = self._create_invoice()
        words = invoice._mr_amount_in_words()
        self.assertTrue(words.endswith('Only'))
        self.assertIn('Two Hundred', words)

    def test_discount_and_hsn_flags(self):
        invoice = self._create_invoice()
        self.assertFalse(invoice._mr_has_discount())
        self.assertFalse(invoice._mr_has_hsn())
        discounted = self._create_invoice(post=False, discount=10.0)
        self.assertTrue(discounted._mr_has_discount())

    def test_optional_meta_is_empty_without_l10n(self):
        invoice = self._create_invoice()
        self.assertEqual(invoice._mr_optional_meta(), [])

    def test_terms_text_is_plain_text(self):
        invoice = self._create_invoice()
        self.assertEqual(invoice._mr_terms_text(), '')
        order = self._create_sale_order()
        order.note = '<p>Payment within 30 days</p>'
        self.assertIn('Payment within 30 days', order._mr_terms_text())
        self.assertNotIn('<p>', order._mr_terms_text())
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: FAIL in `TestDocumentHelpers` with `AttributeError: 'account.move' object has no attribute '_mr_document_title'`.

- [ ] **Step 3: Implement the mixin and the three model adapters**

`modern_reports/models/document_mixin.py`:

```python
from odoo import models


class ModernReportsDocumentMixin(models.AbstractModel):
    _name = 'modern.reports.document.mixin'
    _description = 'Modern Reports document helpers'

    OPTIONAL_META_FIELDS = (
        ('l10n_in_place_of_supply', 'Place of Supply'),
        ('l10n_in_reverse_charge', 'Reverse Charge'),
        ('l10n_in_transport_mode', 'Transport Mode'),
        ('l10n_in_vehicle_no', 'Vehicle Number'),
        ('l10n_in_vehicle_type', 'Vehicle Type'),
    )

    # ---- hooks implemented by each document model -------------------------

    def _mr_document_kind(self):
        raise NotImplementedError

    def _mr_document_title(self, proforma=False):
        raise NotImplementedError

    def _mr_lines(self):
        raise NotImplementedError

    def _mr_line_taxes(self, line):
        raise NotImplementedError

    def _mr_line_qty(self, line):
        raise NotImplementedError

    def _mr_line_uom_name(self, line):
        return ''

    def _mr_terms_text(self):
        return ''

    # ---- shared behaviour -------------------------------------------------

    def _mr_partner(self):
        return self.partner_id

    def _mr_company(self):
        return self.company_id

    def _mr_filter_lines(self, lines):
        return lines.filtered(lambda line: getattr(line, 'display_type', 'product') in (False, 'product'))

    def _mr_line_description(self, line):
        return line.name or ''

    def _mr_line_price(self, line):
        return line.price_unit

    def _mr_line_amount(self, line):
        return self._mr_line_price(line) * self._mr_line_qty(line)

    def _mr_line_discount(self, line):
        return line.discount if 'discount' in line._fields else 0.0

    def _mr_line_subtotal(self, line):
        return line.price_subtotal

    def _mr_line_total(self, line):
        return line.price_total

    def _mr_line_hsn(self, line):
        product = line.product_id
        return product.l10n_in_hsn_code if 'l10n_in_hsn_code' in product._fields else ''

    def _mr_has_discount(self):
        return any(self._mr_line_discount(line) for line in self._mr_lines())

    def _mr_has_hsn(self):
        return any(self._mr_line_hsn(line) for line in self._mr_lines())

    def _mr_tax_columns(self):
        columns = {}
        for line in self._mr_lines():
            for tax in self._mr_line_taxes(line):
                group = tax.tax_group_id
                if group and group.id not in columns:
                    columns[group.id] = {
                        'id': group.id,
                        'name': group.name,
                        'sequence': group.sequence,
                    }
        return sorted(columns.values(), key=lambda column: (column['sequence'], column['name']))

    def _mr_line_tax_rate(self, line, group_id):
        return sum(
            tax.amount
            for tax in self._mr_line_taxes(line)
            if tax.tax_group_id.id == group_id
        )

    def _mr_line_tax_amount(self, line, group_id):
        taxes = self._mr_line_taxes(line)
        if not taxes:
            return 0.0
        currency = self.currency_id
        computed = taxes.compute_all(
            self._mr_line_subtotal(line), currency, 1.0, handle_price_include=False,
        )
        amount = 0.0
        for tax_values in computed.get('taxes', []):
            tax = self.env['account.tax'].browse(tax_values['id'])
            if tax.tax_group_id.id == group_id:
                amount += tax_values['amount']
        return currency.round(amount)

    def _mr_totals_rows(self):
        totals = self.tax_totals or {}
        same_tax_base = totals.get('same_tax_base', False)
        rows = []
        for subtotal in totals.get('subtotals', []):
            groups = subtotal.get('tax_groups') or []
            rows.append({
                'kind': 'subtotal',
                'label': subtotal.get('name') or self.env._('Untaxed Amount'),
                'amount': subtotal.get('base_amount_currency', 0.0),
                'base': None,
            })
            for group in groups:
                rows.append({
                    'kind': 'tax',
                    'label': group.get('group_name', ''),
                    'amount': group.get('tax_amount_currency', 0.0),
                    'base': None if same_tax_base else group.get('display_base_amount_currency'),
                })
        if self.amount_tax:
            rows.append({
                'kind': 'total_tax',
                'label': self.env._('Total Tax'),
                'amount': self.amount_tax,
                'base': None,
            })
        if 'cash_rounding_base_amount_currency' in totals:
            rows.append({
                'kind': 'rounding',
                'label': self.env._('Rounding'),
                'amount': totals['cash_rounding_base_amount_currency'],
                'base': None,
            })
        return rows

    def _mr_total(self):
        return (self.tax_totals or {}).get('total_amount_currency', 0.0)

    def _mr_amount_in_words(self):
        if not self.currency_id or not self.amount_total:
            return ''
        return '%s Only' % self.currency_id.amount_to_text(self.amount_total)

    def _mr_optional_meta(self):
        result = []
        for field_name, label in self.OPTIONAL_META_FIELDS:
            field = self._fields.get(field_name)
            if not field:
                continue
            value = self[field_name]
            if field.type == 'boolean':
                if value:
                    result.append({'label': self.env._(label), 'value': self.env._('Yes')})
                continue
            if not value:
                continue
            if field.type == 'selection':
                value = dict(field.selection or []).get(value, value)
            result.append({'label': self.env._(label), 'value': value})
        return result
```

`modern_reports/models/account_move.py`:

```python
from odoo import models
from odoo.tools import html2plaintext


class AccountMove(models.Model):
    _inherit = ['account.move', 'modern.reports.document.mixin']

    def _mr_document_kind(self):
        return 'account_move'

    def _mr_document_title(self, proforma=False):
        self.ensure_one()
        move_type = self.move_type
        state = self.state
        self_billing = self.journal_id.is_self_billing
        if proforma:
            if move_type == 'out_invoice':
                return {
                    'posted': self.env._('Proforma Invoice'),
                    'draft': self.env._('Draft Proforma Invoice'),
                    'cancel': self.env._('Cancelled Proforma Invoice'),
                }.get(state, self.env._('Proforma Invoice'))
            if move_type == 'out_refund':
                return {
                    'posted': self.env._('Proforma Credit Note'),
                    'draft': self.env._('Draft Proforma Credit Note'),
                    'cancel': self.env._('Cancelled Proforma Credit Note'),
                }.get(state, self.env._('Proforma Credit Note'))
            if move_type == 'in_refund':
                return self.env._('Proforma Vendor Credit Note')
            return self.env._('Proforma Vendor Bill')
        if move_type == 'out_invoice':
            return {
                'posted': self.env._('Invoice'),
                'draft': self.env._('Draft Invoice'),
                'cancel': self.env._('Cancelled Invoice'),
            }.get(state, self.env._('Invoice'))
        if move_type == 'out_refund':
            return {
                'posted': self.env._('Credit Note'),
                'draft': self.env._('Draft Credit Note'),
                'cancel': self.env._('Cancelled Credit Note'),
            }.get(state, self.env._('Credit Note'))
        if move_type == 'in_refund':
            return self.env._('Self Billing Credit Note') if self_billing else self.env._('Vendor Credit Note')
        if move_type == 'in_invoice':
            return self.env._('Self Billing') if self_billing else self.env._('Vendor Bill')
        return self.env._('Invoice')

    def _mr_lines(self):
        return self._mr_filter_lines(self.invoice_line_ids)

    def _mr_line_taxes(self, line):
        return line.tax_ids

    def _mr_line_qty(self, line):
        return line.quantity

    def _mr_line_uom_name(self, line):
        return line.product_uom_id.name or ''

    def _mr_terms_text(self):
        self.ensure_one()
        return html2plaintext(self.invoice_payment_term_id.note or '')
```

`modern_reports/models/sale_order.py`:

```python
from odoo import models
from odoo.tools import html2plaintext


class SaleOrder(models.Model):
    _inherit = ['sale.order', 'modern.reports.document.mixin']

    def _mr_document_kind(self):
        return 'sale_order'

    def _mr_document_title(self, proforma=False):
        self.ensure_one()
        if proforma or self.env.context.get('proforma'):
            return self.env._('Pro-Forma Invoice')
        if self.state in ('draft', 'sent'):
            return self.env._('Quotation')
        return self.env._('Sales Order')

    def _mr_lines(self):
        return self._mr_filter_lines(self._get_order_lines_to_report())

    def _mr_line_taxes(self, line):
        return line.tax_ids

    def _mr_line_qty(self, line):
        return line.product_uom_qty

    def _mr_line_uom_name(self, line):
        return line.product_uom_id.name or ''

    def _mr_terms_text(self):
        self.ensure_one()
        parts = [
            html2plaintext(self.note or ''),
            html2plaintext(self.payment_term_id.note or ''),
        ]
        return '\n'.join(part for part in parts if part)
```

`modern_reports/models/purchase_order.py`:

```python
from odoo import models
from odoo.tools import html2plaintext


class PurchaseOrder(models.Model):
    _inherit = ['purchase.order', 'modern.reports.document.mixin']

    def _mr_document_kind(self):
        return 'purchase_order'

    def _mr_document_title(self, proforma=False):
        self.ensure_one()
        if self.state == 'cancel':
            return self.env._('Cancelled Purchase Order')
        if self.state in ('draft', 'sent', 'to approve'):
            return self.env._('Request for Quotation')
        return self.env._('Purchase Order')

    def _mr_lines(self):
        return self._mr_filter_lines(self.order_line)

    def _mr_line_taxes(self, line):
        return line.tax_ids

    def _mr_line_qty(self, line):
        return line.product_qty

    def _mr_line_uom_name(self, line):
        return line.product_uom_id.name or ''

    def _mr_terms_text(self):
        self.ensure_one()
        return html2plaintext(self.note or '')
```

`modern_reports/models/__init__.py`:

```python
from . import document_mixin
from . import res_company
from . import res_config_settings
from . import account_move
from . import sale_order
from . import purchase_order
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: all `TestCompanyStyle` and `TestDocumentHelpers` tests pass. If `test_amount_in_words` fails on the string check, print the actual value with `print(invoice._mr_amount_in_words())` and assert on a substring that is stable in English (e.g. `'Dollar'`); do not change the helper.

- [ ] **Step 5: Commit**

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "feat(modern_reports): add shared document helpers and titles"
```

---

### Task 3: Modern page chrome and the invoice body

**Files:**
- Create: `modern_reports/report/document_page.xml`
- Create: `modern_reports/report/document_invoice.xml`
- Create: `modern_reports/static/src/scss/document.scss`
- Modify: `modern_reports/__manifest__.py` (add report data + report assets)
- Create: `modern_reports/tests/test_invoice_document.py`
- Modify: `modern_reports/tests/__init__.py`

**Interfaces:**
- Consumes: all `_mr_*` helpers from Task 2 and `_mr_doc_style()` from Task 1.
- Produces: `modern_reports.document_page` (expects `mr_doc`, optional `copy_label`, optional `proforma`, optional `print_with_payments`), shared partials `modern_reports.items_table` and `modern_reports.totals_table` (both read `mr_doc` and `mr_style` from the caller's locals), and `modern_reports.body_account_move` (dispatched when `_mr_document_kind() == 'account_move'`).
- Produces: the invoice print layout replaces `account.report_invoice_document` body for every invoice/credit-note/vendor-bill print entry, with no change to core actions.

- [ ] **Step 1: Write the failing test**

`modern_reports/tests/test_invoice_document.py`:

```python
from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestInvoiceDocument(ModernReportTestCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.invoice = cls._create_invoice()

    def test_header_band_and_copy_strip(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('o_mr_band', html)
        self.assertIn(self.invoice._mr_document_title(), html)
        self.assertIn('Original', html)
        self.assertIn('Duplicate', html)
        self.assertIn('Triplicate', html)
        self.assertIn('#0f766e', html)

    def test_meta_and_parties(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Invoice No', html)
        self.assertIn(self.invoice.name, html)
        self.assertIn('Bill To', html)
        self.assertIn(self.partner_a.name, html)

    def test_items_and_totals(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Modern Widget', html)
        group_name = self.invoice._mr_tax_columns()[0]['name']
        self.assertIn(group_name, html)
        self.assertIn('224.00', html)
        self.assertIn('o_mr_grand_total', html)

    def test_no_powered_by(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertNotIn('powered by', html.lower())
```

`modern_reports/tests/__init__.py`:

```python
from . import test_company_style
from . import test_document_helpers
from . import test_invoice_document
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `TestInvoiceDocument` FAILS — rendered invoice HTML contains Odoo's stock layout classes but no `o_mr_band`.

- [ ] **Step 3: Write the page template, shared partials, invoice inheritance and SCSS**

`modern_reports/report/document_page.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <template id="document_page">
        <t t-set="mr_doc" t-value="mr_doc.with_context(lang=mr_doc._mr_partner().lang or mr_doc.env.lang)"/>
        <t t-set="mr_company" t-value="mr_doc._mr_company()"/>
        <t t-set="mr_style" t-value="mr_company._mr_doc_style()"/>
        <t t-set="mr_copy" t-value="copy_label or 'Original'"/>

        <div class="header o_mr_header"
             t-att-style="'border-bottom: 2pt solid %s; padding-bottom: 4pt;' % mr_style['accent']">
            <table style="width: 100%; border-collapse: collapse;">
                <tbody>
                    <tr>
                        <td style="width: 22%; vertical-align: middle;">
                            <img t-if="mr_company.logo" t-att-src="image_data_uri(mr_company.logo)" alt="Logo"
                                 style="max-height: 18mm; max-width: 100%;"/>
                            <div t-else="" class="o_mr_monogram"
                                 t-att-style="'display: inline-block; width: 16mm; height: 16mm; line-height: 16mm; text-align: center; font-size: 15pt; font-weight: 700; border-radius: 4pt; color: %s; border: 1.5pt solid %s;' % (mr_style['accent'], mr_style['accent'])">
                                <span t-out="mr_company.name[:2].upper()"/>
                            </div>
                        </td>
                        <td style="width: 56%; vertical-align: middle; text-align: center; padding: 0 6pt;">
                            <div t-out="mr_company.name" style="font-weight: 700; font-size: 13pt;"/>
                            <div t-out="mr_company._mr_address_line()" style="font-size: 8pt; color: #64748b;"/>
                            <div t-if="mr_company.phone" t-out="mr_company.phone" style="font-size: 8pt; color: #64748b;"/>
                            <div t-if="mr_company.email" t-out="mr_company.email" style="font-size: 8pt; color: #64748b;"/>
                            <div t-if="mr_company.vat"
                                 t-out="'%s: %s' % (mr_company.account_fiscal_country_id.vat_label or 'Tax ID', mr_company.vat)"
                                 style="font-size: 8pt; color: #64748b;"/>
                            <div t-if="mr_company.company_registry" t-out="mr_company.company_registry"
                                 style="font-size: 8pt; color: #64748b;"/>
                        </td>
                        <td style="width: 22%; vertical-align: middle; text-align: right;">
                            <t t-foreach="('Original', 'Duplicate', 'Triplicate')" t-as="mr_copy_item">
                                <t t-if="mr_copy_item == mr_copy">
                                    <div t-out="mr_copy_item" class="o_mr_copy o_mr_copy_active"
                                         t-att-style="'font-size: 8pt; padding: 1pt 4pt 1pt 0; font-weight: 700; border-right: 3pt solid %s; color: %s;' % (mr_style['accent'], mr_style['accent'])"/>
                                </t>
                                <t t-else="">
                                    <div t-out="mr_copy_item" class="o_mr_copy"
                                         style="font-size: 8pt; padding: 1pt 0; color: #94a3b8;"/>
                                </t>
                            </t>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="article o_mr_doc" t-att-style="'background-color: %s;' % mr_style['background']">
            <div class="o_mr_band" t-att-style="'background-color: %s;' % mr_style['accent']">
                <span class="o_mr_band_title" t-out="mr_doc._mr_document_title(proforma=proforma or False)"/>
            </div>
            <t t-call="{{ 'modern_reports.body_%s' % mr_doc._mr_document_kind() }}"/>
        </div>

        <div class="footer o_mr_footer"
             t-att-style="'border-top: 0.5pt solid %s; padding-top: 3pt; font-size: 7.5pt; color: #64748b;' % mr_style['border']">
            <span t-out="mr_company._mr_footer_line()"/>
            <span style="float: right;">Page <span class="page"/> / <span class="topage"/></span>
        </div>
    </template>

    <template id="items_table">
        <t t-set="mr_tax_columns" t-value="mr_doc._mr_tax_columns()"/>
        <t t-set="mr_show_discount" t-value="mr_doc._mr_has_discount()"/>
        <t t-set="mr_show_hsn" t-value="mr_doc._mr_has_hsn()"/>
        <table class="o_mr_items">
            <thead t-att-style="'background-color: %s;' % mr_style['accent_soft']">
                <tr>
                    <th class="o_mr_num">S.No</th>
                    <th>Description</th>
                    <th t-if="mr_show_hsn">HSN</th>
                    <th>UOM</th>
                    <th class="o_mr_num">Qty</th>
                    <th class="o_mr_num">Unit Price</th>
                    <th class="o_mr_num">Amount</th>
                    <th t-if="mr_show_discount" class="o_mr_num">Disc %</th>
                    <th t-if="mr_show_discount" class="o_mr_num">Taxable</th>
                    <t t-foreach="mr_tax_columns" t-as="mr_column">
                        <th class="o_mr_num" t-out="mr_column['name']"/>
                        <th class="o_mr_num">Amount</th>
                    </t>
                    <th class="o_mr_num">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr t-foreach="mr_doc._mr_lines()" t-as="mr_line">
                    <td class="o_mr_num"><span t-out="mr_line_index + 1"/></td>
                    <td><span t-out="mr_doc._mr_line_description(mr_line)"/></td>
                    <td t-if="mr_show_hsn" t-out="mr_doc._mr_line_hsn(mr_line)"/>
                    <td t-out="mr_doc._mr_line_uom_name(mr_line)"/>
                    <td class="o_mr_num">
                        <span t-out="mr_doc._mr_line_qty(mr_line)" t-options='{"widget": "float", "precision": 2}'/>
                    </td>
                    <td class="o_mr_num">
                        <span t-out="mr_doc._mr_line_price(mr_line)" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                    </td>
                    <td class="o_mr_num">
                        <span t-out="mr_doc._mr_line_amount(mr_line)" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                    </td>
                    <t t-if="mr_show_discount">
                        <td class="o_mr_num">
                            <span t-out="mr_doc._mr_line_discount(mr_line)" t-options='{"widget": "float", "precision": 2}'/>
                        </td>
                        <td class="o_mr_num">
                            <span t-out="mr_doc._mr_line_subtotal(mr_line)" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                        </td>
                    </t>
                    <t t-foreach="mr_tax_columns" t-as="mr_column">
                        <td class="o_mr_num">
                            <span t-out="mr_doc._mr_line_tax_rate(mr_line, mr_column['id'])" t-options='{"widget": "float", "precision": 2}'/>%
                        </td>
                        <td class="o_mr_num">
                            <span t-out="mr_doc._mr_line_tax_amount(mr_line, mr_column['id'])" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                        </td>
                    </t>
                    <td class="o_mr_num">
                        <span t-out="mr_doc._mr_line_total(mr_line)" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                    </td>
                </tr>
            </tbody>
        </table>
    </template>

    <template id="totals_table">
        <table class="o_mr_totals_table">
            <tbody>
                <tr t-foreach="mr_doc._mr_totals_rows()" t-as="mr_row" t-att-class="'o_mr_total_%s' % mr_row['kind']">
                    <td>
                        <span t-out="mr_row['label']"/>
                        <t t-if="mr_row['base']">
                            on <span t-out="mr_row['base']" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                        </t>
                    </td>
                    <td class="o_mr_num">
                        <span t-out="mr_row['amount']" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                    </td>
                </tr>
                <tr class="o_mr_grand_total">
                    <td>Total</td>
                    <td class="o_mr_num">
                        <span t-out="mr_doc._mr_total()" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                    </td>
                </tr>
            </tbody>
        </table>
    </template>

</odoo>
```

`modern_reports/report/document_invoice.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <record id="account.account_invoices" model="ir.actions.report">
        <field name="report_name">modern_reports.report_invoice_with_payments</field>
        <field name="report_file">modern_reports.report_invoice_with_payments</field>
    </record>

    <record id="account.account_invoices_without_payment" model="ir.actions.report">
        <field name="report_name">modern_reports.report_invoice</field>
        <field name="report_file">modern_reports.report_invoice</field>
    </record>

    <template id="report_invoice_document">
        <t t-call="modern_reports.document_page">
            <t t-set="mr_doc" t-value="o"/>
        </t>
    </template>

    <template id="report_invoice">
        <t t-call="web.html_container">
            <t t-foreach="docs" t-as="o">
                <t t-set="lang" t-value="o.partner_id.lang"/>
                <t t-call="modern_reports.report_invoice_document" t-lang="lang"/>
            </t>
        </t>
    </template>

    <template id="report_invoice_with_payments">
        <t t-call="modern_reports.report_invoice">
            <t t-set="print_with_payments" t-value="True"/>
        </t>
    </template>

    <template id="body_account_move">
        <t t-set="mr_is_vendor" t-value="mr_doc.move_type in ('in_invoice', 'in_refund')"/>
        <table class="o_mr_meta">
            <tbody>
                <tr>
                    <td><span class="o_mr_label">Invoice No</span><span t-field="mr_doc.name"/></td>
                    <td><span class="o_mr_label">Invoice Date</span><span t-field="mr_doc.invoice_date" t-options='{"widget": "date"}'/></td>
                    <td t-if="mr_doc.invoice_date_due"><span class="o_mr_label">Due Date</span><span t-field="mr_doc.invoice_date_due" t-options='{"widget": "date"}'/></td>
                    <td t-if="mr_doc.partner_id.ref"><span class="o_mr_label">Customer No</span><span t-field="mr_doc.partner_id.ref"/></td>
                    <td t-if="mr_doc.invoice_payment_term_id"><span class="o_mr_label">Payment Terms</span><span t-field="mr_doc.invoice_payment_term_id.name"/></td>
                    <td t-if="mr_doc.invoice_user_id"><span class="o_mr_label">Salesperson</span><span t-field="mr_doc.invoice_user_id.name"/></td>
                    <t t-foreach="mr_doc._mr_optional_meta()" t-as="mr_meta">
                        <td t-if="mr_meta['value']"><span class="o_mr_label" t-out="mr_meta['label']"/><span t-out="mr_meta['value']"/></td>
                    </t>
                </tr>
            </tbody>
        </table>

        <table class="o_mr_parties">
            <tbody>
                <tr>
                    <td class="o_mr_party">
                        <div class="o_mr_party_title" t-out="'Vendor' if mr_is_vendor else 'Bill To'"/>
                        <div class="o_mr_party_name" t-field="mr_doc.partner_id.name"/>
                        <div t-field="mr_doc.partner_id" t-options='{"widget": "contact", "fields": ["address"], "no_marker": True}'/>
                        <div t-if="mr_doc.partner_id.vat">Tax ID: <span t-field="mr_doc.partner_id.vat"/></div>
                    </td>
                    <td class="o_mr_party">
                        <t t-if="mr_is_vendor">
                            <div class="o_mr_party_title">Bill Reference</div>
                            <div t-out="mr_doc.ref or '—'"/>
                            <div t-if="mr_doc.invoice_date_due">Due <t t-out="mr_doc.invoice_date_due" t-options='{"widget": "date"}'/></div>
                        </t>
                        <t t-else="">
                            <div class="o_mr_party_title">Ship To</div>
                            <t t-if="mr_doc.partner_shipping_id and mr_doc.partner_shipping_id != mr_doc.partner_id">
                                <div class="o_mr_party_name" t-field="mr_doc.partner_shipping_id.name"/>
                                <div t-field="mr_doc.partner_shipping_id" t-options='{"widget": "contact", "fields": ["address"], "no_marker": True}'/>
                            </t>
                            <div t-else="" t-out="mr_doc.partner_id.name"/>
                        </t>
                    </td>
                </tr>
            </tbody>
        </table>

        <t t-call="modern_reports.items_table"/>

        <table class="o_mr_totals">
            <tbody>
                <tr>
                    <td class="o_mr_words"></td>
                    <td class="o_mr_totals_cell">
                        <t t-call="modern_reports.totals_table"/>
                    </td>
                </tr>
            </tbody>
        </table>
    </template>

</odoo>
```

`modern_reports/static/src/scss/document.scss`:

```scss
.o_mr_doc {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.35;
    color: #0f172a;

    .o_mr_band {
        padding: 7pt 10pt;
        margin-bottom: 8pt;
        border-radius: 4pt;
        color: #ffffff;
    }

    .o_mr_band_title {
        font-size: 14pt;
        font-weight: 700;
        letter-spacing: 0.6pt;
        text-transform: uppercase;
    }

    .o_mr_label {
        display: block;
        color: #64748b;
        font-size: 7pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4pt;
    }

    .o_mr_meta,
    .o_mr_parties,
    .o_mr_items,
    .o_mr_totals,
    .o_mr_totals_table,
    .o_mr_payments,
    .o_mr_bottom {
        width: 100%;
        border-collapse: collapse;
    }

    .o_mr_meta {
        margin-bottom: 8pt;

        td {
            border-top: 1pt solid #e2e8f0;
            border-bottom: 1pt solid #e2e8f0;
            padding: 4pt 6pt;
            vertical-align: top;
            font-size: 8.5pt;
        }
    }

    .o_mr_parties {
        margin-bottom: 8pt;

        td.o_mr_party {
            width: 50%;
            border: 1pt solid #e2e8f0;
            border-radius: 4pt;
            padding: 6pt 8pt;
            vertical-align: top;
            font-size: 8.5pt;
        }
    }

    .o_mr_party_title {
        font-weight: 700;
        font-size: 9pt;
        margin-bottom: 2pt;
    }

    .o_mr_party_name {
        font-weight: 700;
    }

    .o_mr_items {
        margin-bottom: 8pt;

        th {
            padding: 4pt 5pt;
            text-align: left;
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3pt;
            border-bottom: 1pt solid #cbd5e1;
        }

        td {
            padding: 4pt 5pt;
            border-bottom: 1pt solid #e2e8f0;
            vertical-align: top;
            font-size: 8.5pt;
        }

        tr {
            page-break-inside: avoid;
        }

        .o_mr_num {
            text-align: right;
            white-space: nowrap;
        }
    }

    .o_mr_totals {
        margin-bottom: 8pt;

        td {
            vertical-align: top;
        }

        .o_mr_words {
            width: 55%;
            padding-right: 10pt;
            font-size: 8pt;
        }

        .o_mr_totals_cell {
            width: 45%;
        }
    }

    .o_mr_totals_table {
        td {
            padding: 3pt 6pt;
            font-size: 8.5pt;
            border-bottom: 1pt solid #e2e8f0;
        }

        .o_mr_num {
            text-align: right;
            white-space: nowrap;
        }

        tr.o_mr_total_subtotal td,
        tr.o_mr_total_total_tax td {
            font-weight: 700;
        }

        tr.o_mr_grand_total td {
            font-size: 10pt;
            font-weight: 700;
            border-top: 1.5pt solid #0f172a;
            border-bottom: none;
        }
    }

    .o_mr_payments {
        margin-bottom: 8pt;

        td {
            padding: 3pt 6pt;
            border-bottom: 1pt solid #e2e8f0;
            font-size: 8.5pt;
        }

        .o_mr_num {
            text-align: right;
            white-space: nowrap;
        }

        tr.o_mr_payment_total td {
            font-weight: 700;
        }
    }

    .o_mr_bottom {
        margin-top: 4pt;

        td {
            vertical-align: top;
            padding: 4pt 8pt 0 0;
            font-size: 8pt;
        }

        .o_mr_bottom_left {
            width: 55%;
        }

        .o_mr_bottom_right {
            width: 45%;
            text-align: right;
        }

        .o_mr_bottom_title {
            font-weight: 700;
            margin-bottom: 2pt;
        }

        .o_mr_sign_line {
            margin-top: 26pt;
            margin-left: auto;
            width: 150pt;
            border-top: 1pt solid #0f172a;
            padding-top: 3pt;
            font-size: 8pt;
        }
    }
}
```

Update `modern_reports/__manifest__.py` data/assets:

```python
    'data': [
        'views/res_config_settings_views.xml',
        'report/document_page.xml',
        'report/document_invoice.xml',
    ],
    'assets': {
        'web.report_assets_common': [
            'modern_reports/static/src/scss/document.scss',
        ],
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/odoo19 && MSYS_NO_PATHCONV=1 ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: all four `TestInvoiceDocument` tests pass. If a `ParseError` appears while loading `document_invoice.xml`, it comes from trying to inherit `account.report_invoice_document`: sibling primary views (`report_invoice_document_preview`, `account_edi_ubl_cii.report_invoice_document`) xpath nodes *inside* `web.external_layout`, so the core view must not be altered. Keep the standalone-template strategy and retarget the report actions instead.

- [ ] **Step 5: Commit**

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "feat(modern_reports): render invoices on the modern page"
```

---

### Task 4: Amount in words, payment rows, bank/terms/signature blocks

**Files:**
- Modify: `modern_reports/report/document_invoice.xml` (words cell, payments block, bottom partial call)
- Modify: `modern_reports/report/document_page.xml` (add `bottom_blocks` template)
- Modify: `modern_reports/tests/test_invoice_document.py` (new cases)

**Interfaces:**
- Consumes: `_mr_amount_in_words()`, `_mr_terms_text()`, `_mr_company().bank_ids`, `amount_residual`, `invoice_payments_widget` (all already available).
- Produces: `modern_reports.bottom_blocks` — shared by the sale and purchase bodies in Tasks 6 and 7; it only reads `mr_doc` and `mr_style`.

- [ ] **Step 1: Write the failing tests**

Append to `modern_reports/tests/test_invoice_document.py` (also add `from odoo import fields` at the top, above the `tagged` import):

```python
    def test_amount_in_words_row(self):
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('in words', html)
        self.assertIn('Only', html)

    def test_payment_rows_for_paid_invoice(self):
        register = self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=self.invoice.ids,
        ).create({'payment_date': fields.Date.today()})
        register._create_payments()
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Amount Due', html)
        self.assertIn('Paid on', html)

    def test_vendor_bill_render(self):
        bill = self._create_invoice(move_type='in_invoice')
        html = self._render('account.account_invoices_without_payment', bill)
        self.assertIn('Vendor Bill', html)
        self.assertIn('Vendor', html)
        self.assertIn('Bill Reference', html)

    def test_background_custom_colour(self):
        self.company.write({'mr_doc_background': 'custom', 'mr_doc_background_color': '#f1f5f9'})
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('#f1f5f9', html)
        self.company.write({'mr_doc_background': 'white', 'mr_doc_background_color': '#ffffff'})

    def test_bank_and_signature_blocks(self):
        self.company.write({'bank_ids': [(0, 0, {'acc_number': '123456789'})]})
        html = self._render('account.account_invoices', self.invoice)
        self.assertIn('Bank Details', html)
        self.assertIn('123456789', html)
        self.assertIn('Authorised Signatory', html)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: the five new tests FAIL (`'in words'`, `'Amount Due'`, `'Bill Reference'`, `'#f1f5f9'`, `'Bank Details'` not found); the Task 3 tests still pass.

- [ ] **Step 3: Implement the words cell, payment table and bottom partial**

In `modern_reports/report/document_invoice.xml`, replace:

```xml
                    <td class="o_mr_words"></td>
```

with:

```xml
                    <td class="o_mr_words">
                        <t t-if="mr_doc._mr_amount_in_words()">
                            <span class="o_mr_label">Total in words</span>
                            <span t-out="mr_doc._mr_amount_in_words()"/>
                        </t>
                    </td>
```

Then, immediately after the closing `</table>` of the `o_mr_totals` table and before `</template>` of `body_account_move`, add:

```xml
        <t t-if="print_with_payments">
            <t t-if="mr_doc.payment_state != 'invoicing_legacy'">
                <t t-set="payments_vals" t-value="mr_doc.sudo().invoice_payments_widget and mr_doc.sudo().invoice_payments_widget['content'] or []"/>
                <table class="o_mr_payments" t-if="payments_vals">
                    <tbody>
                        <tr t-foreach="payments_vals" t-as="payment_vals" t-if="payment_vals['is_exchange'] == 0">
                            <td>
                                <t t-if="payment_vals['is_refund']">Reversed on </t><t t-else="">Paid on </t>
                                <t t-out="payment_vals['date']" t-options='{"widget": "date"}'/>
                            </td>
                            <td class="o_mr_num">
                                <span t-out="payment_vals['amount']" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                            </td>
                        </tr>
                        <tr class="o_mr_payment_total">
                            <td><strong>Amount Due</strong></td>
                            <td class="o_mr_num">
                                <strong t-out="mr_doc.amount_residual" t-options='{"widget": "monetary", "display_currency": mr_doc.currency_id}'/>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </t>
        </t>
        <t t-call="modern_reports.bottom_blocks"/>
```

In `modern_reports/report/document_page.xml`, add before the final `</odoo>`:

```xml
    <template id="bottom_blocks">
        <table class="o_mr_bottom">
            <tbody>
                <tr>
                    <td class="o_mr_bottom_left">
                        <t t-if="mr_doc._mr_company().bank_ids">
                            <div class="o_mr_bottom_title">Bank Details</div>
                            <div t-foreach="mr_doc._mr_company().bank_ids" t-as="mr_bank">
                                <span t-if="mr_bank.bank_id.name" t-out="mr_bank.bank_id.name + ' — '"/>
                                <span t-out="mr_bank.acc_number or ''"/>
                            </div>
                        </t>
                        <t t-if="mr_doc._mr_terms_text()">
                            <div class="o_mr_bottom_title" style="margin-top: 6pt;">Terms &amp; Conditions</div>
                            <div t-out="mr_doc._mr_terms_text()" style="white-space: pre-line;"/>
                        </t>
                    </td>
                    <td class="o_mr_bottom_right">
                        <div>Certified that the particulars given above are true and correct.</div>
                        <div style="margin-top: 6pt;">For <span t-out="mr_doc._mr_company().name"/></div>
                        <div class="o_mr_sign_line">Authorised Signatory</div>
                    </td>
                </tr>
            </tbody>
        </table>
    </template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: all `TestInvoiceDocument` tests pass (9 tests).

- [ ] **Step 5: Commit**

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "feat(modern_reports): add words, payments, bank and signature blocks"
```

---

### Task 5: Copy/proforma print entries and the shared paperformat

**Files:**
- Create: `modern_reports/report/paperformat.xml`
- Create: `modern_reports/report/copy_wrappers.xml`
- Create: `modern_reports/report/report_actions.xml`
- Modify: `modern_reports/__manifest__.py`
- Create: `modern_reports/tests/test_document_copies.py`
- Modify: `modern_reports/tests/__init__.py`

**Interfaces:**
- Consumes: page variables `copy_label` and `proforma` (read by `document_page`), templates `modern_reports.report_invoice_original` … `modern_reports.report_invoice_proforma_triplicate`.
- Produces: `modern_reports.paperformat_modern_documents`, six bound print actions (`modern_reports.action_report_invoice_*`), and `paperformat_id` overrides on the five core document actions.

- [ ] **Step 1: Write the failing test**

`modern_reports/tests/test_document_copies.py`:

```python
from odoo import fields
from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestDocumentCopies(ModernReportTestCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.invoice = cls._create_invoice()

    def test_copy_labels_switch(self):
        for report_ref, label in (
            ('modern_reports.report_invoice_original', 'Original'),
            ('modern_reports.report_invoice_duplicate', 'Duplicate'),
            ('modern_reports.report_invoice_triplicate', 'Triplicate'),
        ):
            html = self._render(report_ref, self.invoice)
            self.assertIn(label, html)
            self.assertIn('o_mr_copy_active', html)

    def test_print_actions_are_bound(self):
        paperformat = self.env.ref('modern_reports.paperformat_modern_documents')
        for xml_id, report_name in (
            ('modern_reports.action_report_invoice_original', 'modern_reports.report_invoice_original'),
            ('modern_reports.action_report_invoice_duplicate', 'modern_reports.report_invoice_duplicate'),
            ('modern_reports.action_report_invoice_triplicate', 'modern_reports.report_invoice_triplicate'),
            ('modern_reports.action_report_invoice_proforma_original', 'modern_reports.report_invoice_proforma_original'),
            ('modern_reports.action_report_invoice_proforma_duplicate', 'modern_reports.report_invoice_proforma_duplicate'),
            ('modern_reports.action_report_invoice_proforma_triplicate', 'modern_reports.report_invoice_proforma_triplicate'),
        ):
            action = self.env.ref(xml_id)
            self.assertEqual(action.report_name, report_name)
            self.assertEqual(action.model, 'account.move')
            self.assertEqual(action.binding_model_id.model, 'account.move')
            self.assertEqual(action.paperformat_id, paperformat)
            self.assertIn('out_invoice', action.domain)

    def test_core_actions_use_modern_paperformat(self):
        paperformat = self.env.ref('modern_reports.paperformat_modern_documents')
        for xml_id in (
            'account.account_invoices',
            'account.account_invoices_without_payment',
            'sale.action_report_saleorder',
            'sale.action_report_pro_forma_invoice',
            'purchase.action_report_purchase_order',
        ):
            self.assertEqual(self.env.ref(xml_id).paperformat_id, paperformat)

    def test_proforma_omits_payments_and_shows_title(self):
        register = self.env['account.payment.register'].with_context(
            active_model='account.move', active_ids=self.invoice.ids,
        ).create({'payment_date': fields.Date.today()})
        register._create_payments()
        html = self._render('modern_reports.report_invoice_proforma_original', self.invoice)
        self.assertIn('Proforma Invoice', html)
        self.assertNotIn('Amount Due', html)
```

`modern_reports/tests/__init__.py`:

```python
from . import test_company_style
from . import test_document_helpers
from . import test_invoice_document
from . import test_document_copies
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `TestDocumentCopies` FAILS with `ValueError: External ID not found: modern_reports.paperformat_modern_documents` (or a missing-report rendering error); earlier tests still pass.

- [ ] **Step 3: Write the paperformat, wrappers and actions**

`modern_reports/report/paperformat.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <record id="paperformat_modern_documents" model="report.paperformat">
        <field name="name">Modern Documents A4</field>
        <field name="default" eval="False"/>
        <field name="format">A4</field>
        <field name="orientation">Portrait</field>
        <field name="margin_top">30</field>
        <field name="margin_bottom">18</field>
        <field name="margin_left">8</field>
        <field name="margin_right">8</field>
        <field name="header_spacing">3</field>
        <field name="dpi">96</field>
    </record>

</odoo>
```

`modern_reports/report/copy_wrappers.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <template id="report_invoice_original">
        <t t-call="account.report_invoice_with_payments">
            <t t-set="copy_label" t-value="'Original'"/>
        </t>
    </template>

    <template id="report_invoice_duplicate">
        <t t-call="account.report_invoice_with_payments">
            <t t-set="copy_label" t-value="'Duplicate'"/>
        </t>
    </template>

    <template id="report_invoice_triplicate">
        <t t-call="account.report_invoice_with_payments">
            <t t-set="copy_label" t-value="'Triplicate'"/>
        </t>
    </template>

    <template id="report_invoice_proforma_original">
        <t t-call="account.report_invoice">
            <t t-set="copy_label" t-value="'Original'"/>
            <t t-set="proforma" t-value="True"/>
        </t>
    </template>

    <template id="report_invoice_proforma_duplicate">
        <t t-call="account.report_invoice">
            <t t-set="copy_label" t-value="'Duplicate'"/>
            <t t-set="proforma" t-value="True"/>
        </t>
    </template>

    <template id="report_invoice_proforma_triplicate">
        <t t-call="account.report_invoice">
            <t t-set="copy_label" t-value="'Triplicate'"/>
            <t t-set="proforma" t-value="True"/>
        </t>
    </template>

</odoo>
```

`modern_reports/report/report_actions.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Core document print entries print on the modern paperformat. -->

    <record id="account.account_invoices" model="ir.actions.report">
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
    </record>
    <record id="account.account_invoices_without_payment" model="ir.actions.report">
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
    </record>
    <record id="sale.action_report_saleorder" model="ir.actions.report">
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
    </record>
    <record id="sale.action_report_pro_forma_invoice" model="ir.actions.report">
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
    </record>
    <record id="purchase.action_report_purchase_order" model="ir.actions.report">
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
    </record>

    <!-- Invoice copies -->

    <record id="action_report_invoice_original" model="ir.actions.report">
        <field name="name">Invoice – Original</field>
        <field name="model">account.move</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">modern_reports.report_invoice_original</field>
        <field name="report_file">modern_reports.report_invoice_original</field>
        <field name="print_report_name">'%s' % object._get_report_base_filename()</field>
        <field name="binding_model_id" ref="account.model_account_move"/>
        <field name="binding_type">report</field>
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
        <field name="group_ids" eval="[(6, 0, [ref('account.group_account_invoice'), ref('account.group_account_readonly')])]"/>
        <field name="domain">[('move_type', 'in', ('out_invoice', 'out_refund'))]</field>
    </record>

    <record id="action_report_invoice_duplicate" model="ir.actions.report">
        <field name="name">Invoice – Duplicate</field>
        <field name="model">account.move</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">modern_reports.report_invoice_duplicate</field>
        <field name="report_file">modern_reports.report_invoice_duplicate</field>
        <field name="print_report_name">'%s_duplicate' % object._get_report_base_filename()</field>
        <field name="binding_model_id" ref="account.model_account_move"/>
        <field name="binding_type">report</field>
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
        <field name="group_ids" eval="[(6, 0, [ref('account.group_account_invoice'), ref('account.group_account_readonly')])]"/>
        <field name="domain">[('move_type', 'in', ('out_invoice', 'out_refund'))]</field>
    </record>

    <record id="action_report_invoice_triplicate" model="ir.actions.report">
        <field name="name">Invoice – Triplicate</field>
        <field name="model">account.move</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">modern_reports.report_invoice_triplicate</field>
        <field name="report_file">modern_reports.report_invoice_triplicate</field>
        <field name="print_report_name">'%s_triplicate' % object._get_report_base_filename()</field>
        <field name="binding_model_id" ref="account.model_account_move"/>
        <field name="binding_type">report</field>
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
        <field name="group_ids" eval="[(6, 0, [ref('account.group_account_invoice'), ref('account.group_account_readonly')])]"/>
        <field name="domain">[('move_type', 'in', ('out_invoice', 'out_refund'))]</field>
    </record>

    <!-- Proforma invoice copies -->

    <record id="action_report_invoice_proforma_original" model="ir.actions.report">
        <field name="name">Proforma Invoice – Original</field>
        <field name="model">account.move</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">modern_reports.report_invoice_proforma_original</field>
        <field name="report_file">modern_reports.report_invoice_proforma_original</field>
        <field name="print_report_name">'%s_proforma' % object._get_report_base_filename()</field>
        <field name="binding_model_id" ref="account.model_account_move"/>
        <field name="binding_type">report</field>
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
        <field name="group_ids" eval="[(6, 0, [ref('account.group_account_invoice'), ref('account.group_account_readonly')])]"/>
        <field name="domain">[('move_type', 'in', ('out_invoice', 'out_refund'))]</field>
    </record>

    <record id="action_report_invoice_proforma_duplicate" model="ir.actions.report">
        <field name="name">Proforma Invoice – Duplicate</field>
        <field name="model">account.move</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">modern_reports.report_invoice_proforma_duplicate</field>
        <field name="report_file">modern_reports.report_invoice_proforma_duplicate</field>
        <field name="print_report_name">'%s_proforma_duplicate' % object._get_report_base_filename()</field>
        <field name="binding_model_id" ref="account.model_account_move"/>
        <field name="binding_type">report</field>
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
        <field name="group_ids" eval="[(6, 0, [ref('account.group_account_invoice'), ref('account.group_account_readonly')])]"/>
        <field name="domain">[('move_type', 'in', ('out_invoice', 'out_refund'))]</field>
    </record>

    <record id="action_report_invoice_proforma_triplicate" model="ir.actions.report">
        <field name="name">Proforma Invoice – Triplicate</field>
        <field name="model">account.move</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">modern_reports.report_invoice_proforma_triplicate</field>
        <field name="report_file">modern_reports.report_invoice_proforma_triplicate</field>
        <field name="print_report_name">'%s_proforma_triplicate' % object._get_report_base_filename()</field>
        <field name="binding_model_id" ref="account.model_account_move"/>
        <field name="binding_type">report</field>
        <field name="paperformat_id" ref="paperformat_modern_documents"/>
        <field name="group_ids" eval="[(6, 0, [ref('account.group_account_invoice'), ref('account.group_account_readonly')])]"/>
        <field name="domain">[('move_type', 'in', ('out_invoice', 'out_refund'))]</field>
    </record>

</odoo>
```

Update `modern_reports/__manifest__.py` `data` to:

```python
    'data': [
        'views/res_config_settings_views.xml',
        'report/paperformat.xml',
        'report/document_page.xml',
        'report/document_invoice.xml',
        'report/copy_wrappers.xml',
        'report/report_actions.xml',
    ],
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `TestDocumentCopies` passes; if `group_ids` fails to load, confirm the field exists (`ir.actions.report` uses `group_ids` in Odoo 19, not `groups_id`).

- [ ] **Step 5: Commit**

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "feat(modern_reports): add copy/proforma print entries and paperformat"
```

---

### Task 6: Sale order and quotation body

**Files:**
- Create: `modern_reports/report/document_sale_order.xml`
- Modify: `modern_reports/__manifest__.py`
- Create: `modern_reports/tests/test_sale_document.py`
- Modify: `modern_reports/tests/__init__.py`

**Interfaces:**
- Consumes: `modern_reports.document_page`, `items_table`, `totals_table`, `bottom_blocks`; sale hooks from Task 2.
- Produces: `modern_reports.body_sale_order` (dispatched for `_mr_document_kind() == 'sale_order'`) and the modern layout on `sale.report_saleorder_document` (quotation, confirmed order and the existing SO proforma).

- [ ] **Step 1: Write the failing test**

`modern_reports/tests/test_sale_document.py`:

```python
from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestSaleDocument(ModernReportTestCommon):

    def test_quotation_render(self):
        order = self._create_sale_order()
        html = self._render('sale.action_report_saleorder', order)
        self.assertIn('Quotation', html)
        self.assertIn(order.name, html)
        self.assertIn('Bill To', html)
        self.assertIn('Modern Widget', html)
        self.assertIn('224.00', html)
        self.assertIn('in words', html)

    def test_confirmed_order_render(self):
        order = self._create_sale_order(confirm=True)
        html = self._render('sale.action_report_saleorder', order)
        self.assertIn('Sales Order', html)

    def test_proforma_render(self):
        order = self._create_sale_order(confirm=True)
        html = self._render('sale.action_report_pro_forma_invoice', order)
        self.assertIn('Pro-Forma Invoice', html)

    def test_terms_and_signature(self):
        order = self._create_sale_order()
        order.note = '<p>Payment within 30 days</p>'
        html = self._render('sale.action_report_saleorder', order)
        self.assertIn('Payment within 30 days', html)
        self.assertIn('Authorised Signatory', html)
```

`modern_reports/tests/__init__.py`:

```python
from . import test_company_style
from . import test_document_helpers
from . import test_invoice_document
from . import test_document_copies
from . import test_sale_document
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `TestSaleDocument` FAILS (`'Bill To'` / `'in words'` not in the stock sale HTML); other tests pass.

- [ ] **Step 3: Write the sale body and inherit the core sale template**

`modern_reports/report/document_sale_order.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <template id="report_saleorder_document_modern" inherit_id="sale.report_saleorder_document">
        <xpath expr="//t[@t-call='web.external_layout']" position="replace">
            <t t-call="modern_reports.document_page">
                <t t-set="mr_doc" t-value="doc"/>
            </t>
        </xpath>
    </template>

    <template id="body_sale_order">
        <table class="o_mr_meta">
            <tbody>
                <tr>
                    <td><span class="o_mr_label">Order No</span><span t-field="mr_doc.name"/></td>
                    <td><span class="o_mr_label">Order Date</span><span t-field="mr_doc.date_order" t-options='{"widget": "date"}'/></td>
                    <td t-if="mr_doc.validity_date"><span class="o_mr_label">Valid Until</span><span t-field="mr_doc.validity_date" t-options='{"widget": "date"}'/></td>
                    <td t-if="mr_doc.client_order_ref"><span class="o_mr_label">Customer Reference</span><span t-field="mr_doc.client_order_ref"/></td>
                    <td t-if="mr_doc.partner_id.ref"><span class="o_mr_label">Customer No</span><span t-field="mr_doc.partner_id.ref"/></td>
                    <td t-if="mr_doc.payment_term_id"><span class="o_mr_label">Payment Terms</span><span t-field="mr_doc.payment_term_id.name"/></td>
                    <td t-if="mr_doc.pricelist_id"><span class="o_mr_label">Pricelist</span><span t-field="mr_doc.pricelist_id.name"/></td>
                    <td t-if="mr_doc.user_id"><span class="o_mr_label">Salesperson</span><span t-field="mr_doc.user_id.name"/></td>
                    <t t-foreach="mr_doc._mr_optional_meta()" t-as="mr_meta">
                        <td t-if="mr_meta['value']"><span class="o_mr_label" t-out="mr_meta['label']"/><span t-out="mr_meta['value']"/></td>
                    </t>
                </tr>
            </tbody>
        </table>

        <table class="o_mr_parties">
            <tbody>
                <tr>
                    <td class="o_mr_party">
                        <div class="o_mr_party_title">Bill To</div>
                        <div class="o_mr_party_name" t-field="mr_doc.partner_id.name"/>
                        <div t-field="mr_doc.partner_id" t-options='{"widget": "contact", "fields": ["address"], "no_marker": True}'/>
                        <div t-if="mr_doc.partner_id.vat">Tax ID: <span t-field="mr_doc.partner_id.vat"/></div>
                    </td>
                    <td class="o_mr_party">
                        <div class="o_mr_party_title">Ship To</div>
                        <t t-if="mr_doc.partner_shipping_id and mr_doc.partner_shipping_id != mr_doc.partner_id">
                            <div class="o_mr_party_name" t-field="mr_doc.partner_shipping_id.name"/>
                            <div t-field="mr_doc.partner_shipping_id" t-options='{"widget": "contact", "fields": ["address"], "no_marker": True}'/>
                        </t>
                        <div t-else="" t-out="mr_doc.partner_id.name"/>
                    </td>
                </tr>
            </tbody>
        </table>

        <t t-call="modern_reports.items_table"/>

        <table class="o_mr_totals">
            <tbody>
                <tr>
                    <td class="o_mr_words">
                        <t t-if="mr_doc._mr_amount_in_words()">
                            <span class="o_mr_label">Total in words</span>
                            <span t-out="mr_doc._mr_amount_in_words()"/>
                        </t>
                    </td>
                    <td class="o_mr_totals_cell">
                        <t t-call="modern_reports.totals_table"/>
                    </td>
                </tr>
            </tbody>
        </table>

        <t t-call="modern_reports.bottom_blocks"/>
    </template>

</odoo>
```

Update the manifest `data` list — add `'report/document_sale_order.xml'` after `'report/document_invoice.xml'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `TestSaleDocument` passes (4 tests). If the proforma test shows "Quotation" instead of "Pro-Forma Invoice", verify the page passes the `proforma` template variable and that `_mr_document_title` also reads `self.env.context.get('proforma')` (the core SO proforma wrapper sets it through `with_context`).

- [ ] **Step 5: Commit**

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "feat(modern_reports): render sale orders and quotations on the modern page"
```

---

### Task 7: Purchase order and RFQ body

**Files:**
- Create: `modern_reports/report/document_purchase_order.xml`
- Modify: `modern_reports/__manifest__.py`
- Create: `modern_reports/tests/test_purchase_document.py`
- Modify: `modern_reports/tests/__init__.py`

**Interfaces:**
- Consumes: `modern_reports.document_page`, `items_table`, `totals_table`, `bottom_blocks`; purchase hooks from Task 2.
- Produces: `modern_reports.body_purchase_order` (dispatched for `_mr_document_kind() == 'purchase_order'`) and the modern layout on `purchase.report_purchaseorder_document` (RFQ and confirmed order).

- [ ] **Step 1: Write the failing test**

`modern_reports/tests/test_purchase_document.py`:

```python
from odoo.tests import tagged

from .common import ModernReportTestCommon


@tagged('post_install', '-at_install')
class TestPurchaseDocument(ModernReportTestCommon):

    def test_rfq_render(self):
        order = self._create_purchase_order()
        html = self._render('purchase.action_report_purchase_order', order)
        self.assertIn('Request for Quotation', html)
        self.assertIn(order.name, html)
        self.assertIn('Vendor', html)
        self.assertIn('Modern Widget', html)
        self.assertIn('224.00', html)
        self.assertIn('in words', html)

    def test_confirmed_order_render(self):
        order = self._create_purchase_order(confirm=True)
        html = self._render('purchase.action_report_purchase_order', order)
        self.assertIn('Purchase Order', html)

    def test_terms_and_signature(self):
        order = self._create_purchase_order()
        order.note = '<p>Deliver to the central warehouse</p>'
        html = self._render('purchase.action_report_purchase_order', order)
        self.assertIn('Deliver to the central warehouse', html)
        self.assertIn('Authorised Signatory', html)
```

`modern_reports/tests/__init__.py`:

```python
from . import test_company_style
from . import test_document_helpers
from . import test_invoice_document
from . import test_document_copies
from . import test_sale_document
from . import test_purchase_document
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `TestPurchaseDocument` FAILS (`'in words'` / `'Authorised Signatory'` not in the stock PO HTML); other tests pass.

- [ ] **Step 3: Write the purchase body and inherit the core template**

`modern_reports/report/document_purchase_order.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <template id="report_purchaseorder_document_modern" inherit_id="purchase.report_purchaseorder_document">
        <xpath expr="//t[@t-call='web.external_layout']" position="replace">
            <t t-call="modern_reports.document_page">
                <t t-set="mr_doc" t-value="o"/>
            </t>
        </xpath>
    </template>

    <template id="body_purchase_order">
        <table class="o_mr_meta">
            <tbody>
                <tr>
                    <td><span class="o_mr_label">Order No</span><span t-field="mr_doc.name"/></td>
                    <td><span class="o_mr_label">Order Date</span><span t-field="mr_doc.date_order" t-options='{"widget": "date"}'/></td>
                    <td t-if="mr_doc.partner_ref"><span class="o_mr_label">Vendor Reference</span><span t-field="mr_doc.partner_ref"/></td>
                    <td t-if="mr_doc.date_planned"><span class="o_mr_label">Expected Arrival</span><span t-field="mr_doc.date_planned" t-options='{"widget": "date"}'/></td>
                    <td t-if="mr_doc.payment_term_id"><span class="o_mr_label">Payment Terms</span><span t-field="mr_doc.payment_term_id.name"/></td>
                    <td t-if="mr_doc.user_id"><span class="o_mr_label">Buyer</span><span t-field="mr_doc.user_id.name"/></td>
                    <td t-if="mr_doc.incoterm_id"><span class="o_mr_label">Incoterm</span><span t-field="mr_doc.incoterm_id.name"/></td>
                    <t t-foreach="mr_doc._mr_optional_meta()" t-as="mr_meta">
                        <td t-if="mr_meta['value']"><span class="o_mr_label" t-out="mr_meta['label']"/><span t-out="mr_meta['value']"/></td>
                    </t>
                </tr>
            </tbody>
        </table>

        <table class="o_mr_parties">
            <tbody>
                <tr>
                    <td class="o_mr_party">
                        <div class="o_mr_party_title">Vendor</div>
                        <div class="o_mr_party_name" t-field="mr_doc.partner_id.name"/>
                        <div t-field="mr_doc.partner_id" t-options='{"widget": "contact", "fields": ["address"], "no_marker": True}'/>
                        <div t-if="mr_doc.partner_id.vat">Tax ID: <span t-field="mr_doc.partner_id.vat"/></div>
                    </td>
                    <td class="o_mr_party">
                        <div class="o_mr_party_title">Ship To</div>
                        <t t-if="mr_doc.dest_address_id">
                            <div class="o_mr_party_name" t-field="mr_doc.dest_address_id.name"/>
                            <div t-field="mr_doc.dest_address_id" t-options='{"widget": "contact", "fields": ["address"], "no_marker": True}'/>
                        </t>
                        <div t-else="" t-out="mr_doc.picking_type_id.warehouse_id.name or mr_doc.company_id.name"/>
                    </td>
                </tr>
            </tbody>
        </table>

        <t t-call="modern_reports.items_table"/>

        <table class="o_mr_totals">
            <tbody>
                <tr>
                    <td class="o_mr_words">
                        <t t-if="mr_doc._mr_amount_in_words()">
                            <span class="o_mr_label">Total in words</span>
                            <span t-out="mr_doc._mr_amount_in_words()"/>
                        </t>
                    </td>
                    <td class="o_mr_totals_cell">
                        <t t-call="modern_reports.totals_table"/>
                    </td>
                </tr>
            </tbody>
        </table>

        <t t-call="modern_reports.bottom_blocks"/>
    </template>

</odoo>
```

Update the manifest `data` list — add `'report/document_purchase_order.xml'` after `'report/document_sale_order.xml'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: `TestPurchaseDocument` passes (3 tests) and the whole `modern_reports` suite is green.

- [ ] **Step 5: Commit**

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "feat(modern_reports): render purchase orders and RFQs on the modern page"
```

---

### Task 8: Real PDF verification, layout fixes and final suite

**Files:**
- Modify: `modern_reports/static/src/scss/document.scss` (only if the PDF review finds overflow/overlap)
- Modify: `modern_reports/report/paperformat.xml` (only if header/footer overlap content)

**Interfaces:**
- Consumes: everything built in Tasks 1–7.
- Produces: visually verified A4 PDFs for invoice, invoice duplicate, invoice proforma, sale order and purchase order, plus a confirmed accent/background override; no "Powered by".

- [ ] **Step 1: Run the full module test suite**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: every test in `modern_reports` passes (`0 failed, 0 error(s)`). Do not continue if any test fails.

- [ ] **Step 2: Make sure the local server is running (wkhtmltopdf needs a real, non-test render)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8069/web/login?db=odoo_local"`

Expected: `200`. If it is not `200`, start it and poll until it is:

```bash
cd C:/odoo19 && (nohup ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf > /tmp/odoo-local.log 2>&1 &)
sleep 5 && curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8069/web/login?db=odoo_local"
```

- [ ] **Step 3: Render the PDFs through the Odoo shell**

Run:

```bash
cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin shell -c odoo-local.conf -d odoo_local <<'PY'
import os
from odoo import fields

out_dir = os.path.join(os.environ.get('TEMP', '/tmp'), 'mr')
os.makedirs(out_dir, exist_ok=True)

partner = env['res.partner'].search([('customer_rank', '>', 0)], limit=1) or env['res.partner'].search([], limit=1)
product = env['product.product'].search([('sale_ok', '=', True)], limit=1)
vendor = env['res.partner'].search([('supplier_rank', '>', 0)], limit=1)
if not vendor:
    vendor = env['res.partner'].create({'name': 'Print Check Vendor', 'supplier_rank': 1})

def make_invoice(move_type, lines=1, post=True):
    move = env['account.move'].create({
        'move_type': move_type,
        'partner_id': (vendor if move_type in ('in_invoice', 'in_refund') else partner).id,
        'invoice_date': fields.Date.today(),
        'invoice_line_ids': [(0, 0, {
            'name': 'Print check line %s' % index,
            'product_id': product.id,
            'quantity': 2.0,
            'price_unit': 100.0,
        }) for index in range(1, lines + 1)],
    })
    if post:
        move.action_post()
    return move

def make_sale(confirm):
    order = env['sale.order'].create({
        'partner_id': partner.id,
        'order_line': [(0, 0, {'product_id': product.id, 'product_uom_qty': 2.0})],
    })
    if confirm:
        order.action_confirm()
    return order

def make_purchase(confirm):
    order = env['purchase.order'].create({
        'partner_id': vendor.id,
        'order_line': [(0, 0, {
            'product_id': product.id, 'product_qty': 2.0,
            'price_unit': 100.0, 'date_planned': fields.Datetime.now(),
        })],
    })
    if confirm:
        order.button_confirm()
    return order

invoice = make_invoice('out_invoice')
draft_invoice = make_invoice('out_invoice', post=False)
credit_note = make_invoice('out_refund')
vendor_bill = make_invoice('in_invoice')
multi_page_invoice = make_invoice('out_invoice', lines=40)
quotation = make_sale(confirm=False)
sale_order = make_sale(confirm=True)
rfq = make_purchase(confirm=False)
purchase_order = make_purchase(confirm=True)

renders = [
    ('account.account_invoices', invoice, 'invoice_posted.pdf'),
    ('account.account_invoices', draft_invoice, 'invoice_draft.pdf'),
    ('account.account_invoices', credit_note, 'credit_note.pdf'),
    ('account.account_invoices_without_payment', vendor_bill, 'vendor_bill.pdf'),
    ('account.account_invoices', multi_page_invoice, 'invoice_multipage.pdf'),
    ('modern_reports.report_invoice_duplicate', invoice, 'invoice_duplicate.pdf'),
    ('modern_reports.report_invoice_proforma_original', invoice, 'proforma_original.pdf'),
    ('modern_reports.report_invoice_proforma_duplicate', invoice, 'proforma_duplicate.pdf'),
    ('modern_reports.report_invoice_proforma_triplicate', invoice, 'proforma_triplicate.pdf'),
    ('sale.action_report_saleorder', quotation, 'quotation.pdf'),
    ('sale.action_report_saleorder', sale_order, 'sale_order.pdf'),
    ('sale.action_report_pro_forma_invoice', sale_order, 'sale_proforma.pdf'),
    ('purchase.action_report_purchase_order', rfq, 'rfq.pdf'),
    ('purchase.action_report_purchase_order', purchase_order, 'purchase_order.pdf'),
]
reports = env['ir.actions.report']
for report_ref, record, filename in renders:
    pdf, report_type = reports._render_qweb_pdf(report_ref, record.ids)
    if report_type != 'pdf':
        raise RuntimeError('PDF rendering unavailable for %s' % report_ref)
    path = os.path.join(out_dir, filename)
    with open(path, 'wb') as handle:
        handle.write(pdf)
    print('wrote', path)

env.cr.commit()
print('done')
PY
```

Expected: fourteen `wrote C:\...\Temp\mr\*.pdf` lines ending with `done`. If wkhtmltopdf is missing, the script raises; install the wkhtmltopdf build already used by Odoo on this machine before continuing (same binary the stock reports use).

- [ ] **Step 4: Inspect every PDF**

Open each file with the Read tool (posted invoice, draft invoice, credit note, vendor bill, multi-page invoice, invoice duplicate, the three proforma copies, quotation, sale order, sale proforma, RFQ, purchase order) and check, on every page:

1. Header: logo left / company block centred / copy strip right, no overlap, accent underline visible; only the action's own copy label is bold (duplicate/proforma PDFs).
2. Band: uppercase title, white text readable on the accent background.
3. Meta grid and Bill To / Ship To boxes are aligned; vendor bill shows Vendor + Bill Reference.
4. Item table fits the A4 width in one go; numbers right aligned; Total column ends inside the page; long descriptions wrap instead of overflowing.
5. Totals right-aligned: Untaxed Amount, tax row(s), Total Tax, bold Total; words text on the left; credit notes show negative amounts.
6. Bank details (if any), terms and the signature block do not collide; signature line anchored right.
7. Footer on every page: company/footer line left, `Page X / Y` right. In `invoice_multipage.pdf`, page 2 must also repeat the letterhead and the item-table header row, and no row or total may be clipped by the header/footer.
8. No "Powered by", no watermark. Proforma PDF shows "Proforma Invoice" and no Amount Due row; duplicate PDF shows "Duplicate" active.

If something overflows, fix only the SCSS cell padding/font-size or the paperformat margins (top 30 mm / bottom 18 mm are starting values), rebuild with `-u modern_reports`, re-render, and re-inspect.

- [ ] **Step 5: Verify the accent/background override on a real PDF**

Run:

```bash
cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin shell -c odoo-local.conf -d odoo_local <<'PY'
import os

company = env.company
previous = {
    'mr_doc_accent_color': company.mr_doc_accent_color,
    'mr_doc_background': company.mr_doc_background,
    'mr_doc_background_color': company.mr_doc_background_color,
}
company.write({'mr_doc_accent_color': '#b45309', 'mr_doc_background': 'tint'})
print('style', company._mr_doc_style())

invoice = env['account.move'].search([('move_type', '=', 'out_invoice'), ('state', '=', 'posted')], limit=1)
out_dir = os.path.join(os.environ.get('TEMP', '/tmp'), 'mr')
pdf, report_type = env['ir.actions.report']._render_qweb_pdf('account.account_invoices', invoice.ids)
if report_type != 'pdf':
    raise RuntimeError('PDF rendering unavailable')
path = os.path.join(out_dir, 'invoice_accent.pdf')
with open(path, 'wb') as handle:
    handle.write(pdf)

company.write(previous)
env.cr.commit()
print('wrote', path)
PY
```

Open `invoice_accent.pdf`: the band and table header must use the amber accent (`#b45309`) and the page background must be the soft tint — proving the per-company override drives the print colours. Company settings are restored by the same script.

- [ ] **Step 6: Re-run the suite and commit any layout fixes**

Run: `cd C:/odoo19 && ./venv/Scripts/python.exe odoo-src/odoo-bin -c odoo-local.conf -d odoo_local -u modern_reports --test-enable --test-tags /modern_reports --stop-after-init`

Expected: still green.

```bash
cd C:/odoo19/extra-addons && git add modern_reports && git commit -m "fix(modern_reports): tune print layout after PDF review"
```

(If Step 4/5 needed no changes, skip the commit — the tree is already clean.)

**Result (2026-11-25):** wkhtmltopdf is not installed on this workstation, so
Step 3/5 PDFs could not be produced locally. Verification was done on the
rendered report HTML (`_render_qweb_html`) screenshotted in headless Chrome at
A4 width for invoice, duplicate, proforma, quotation, purchase order and the
amber-accent/tint variant — all matched the checklist. Fixes committed in
`78d4e01`: the item table now uses a fixed column grid (description keeps the
remaining width, numeric headers wrap instead of bleeding into the next
column). `Page X / Y` placeholders stay empty in HTML by design; repeat
letterhead on page 2 and footer page numbers still need a real PDF check,
which is only possible on the production server.

**Production PDF result (2026-11-25):** after installing wkhtmltopdf 0.12.6.1 on
72.62.198.140, real PDFs from DB `crm` showed three fixes were needed:
`border-collapse: separate` for hairline-free grids (`5e17bec`), and the
letterhead. The letterhead could not stay in the wkhtmltopdf header sheet —
it was mis-placed over the title band no matter the margin/spacing. Root
cause of the final fix: `_prepare_html` (`ir_actions_report.py`) only keeps
`div.header`, `div.footer` and `div.article` nodes, so the letterhead now
lives inside `div.article` as a white strip above the band (`f0b7db0`,
`a24723b`), the top margin is 14 mm, and page numbers stay in the footer
sheet. Verified on prod: invoice, duplicate copy (highlight moves), proforma
and sales order render correctly; a 60-line rolled-back SO repeats the item
table header on page 2 with `Page 2 / 2`. Letterhead prints on page 1 only,
matching the XLSX layout. Purchase order could not be rendered visually
(no PO records on `crm`); its tests still pass. The stock `Your logo`
placeholder is replaced by the initials monogram via `uses_default_logo`.

---

**Out of scope for this plan:** deployment. When the user explicitly approves, the release step is: commit → push `origin main` → `ssh root@72.62.198.140 "bash /var/www/odoo/update.sh"`, then a one-time install of `modern_reports` on the production databases (`crm`, `olee`, `rebelsoft`) and a visual check of the four documents on `crm.ibitltd.com`.
