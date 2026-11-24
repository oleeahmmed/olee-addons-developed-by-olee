# Modern Reports — printed documents (Sales Order, Invoice, Proforma, Purchase Order)

Status: Draft for review — 2026-11-25
Repo: `C:\odoo19\extra-addons` · New addon: `modern_reports`

## 1. Goal

Replace the printed layout of four business documents with one modern layout inspired by the
user's preferred "Tax Invoice" reference (GST-1 style): logo box on the left, company details
centered, copy-type box on the right, an accent-coloured title band, a bordered meta grid,
bill-to / ship-to boxes, an item table with per-tax columns, totals, bank details, terms and a
signature area — flat, shadcn-inspired spacing on top of Odoo's own data.

- Same skeleton for all four documents; only titles, meta labels and parties change.
- Accent colour defaults to the company theme colour; overridable per company in Settings.
- Page background: white, soft accent tint, or a custom colour.
- No "Powered by" text and no template watermark anywhere.

## 2. User-confirmed decisions

| Topic | Decision |
|---|---|
| Base format | The attached Tax Invoice (GST-1 style) layout, not "Sales Invoice 4" |
| Header arrangement | Logo box left, company info center, copy box right |
| Copy labels | Original / Duplicate / Triplicate in the header box; three print-menu options for invoices and proformas; SO/PO always print "Original" |
| Scope | Same layout on SO, Invoice, Proforma, Purchase Order |
| Colours | Default = company theme primary colour (`res.company.mt_primary_color`); per-company override in Settings; background white / soft / custom |
| Branding | No "POWERED BY", no decorative watermark/pattern from the reference template |

## 3. Scope

In scope:

- `account.move` customer invoice, credit note, vendor bill and vendor credit note (all states),
  plus a proforma variant for customer documents (new print entries — Odoo 19 CE has no proforma
  print entry for invoices, only an internal email fallback).
- `sale.order` quotation / sales order and the existing Pro-forma Invoice print (which is only
  available when the Sales setting "Pro-forma Invoices" is enabled — unchanged).
- `purchase.order` RFQ and purchase order (same Odoo report action).
- Three copy print entries for invoices and three for invoice proformas.
- Three new configuration fields on `res.company` (+ Settings UI) for accent/background.

Out of scope:

- E-invoicing/QR codes, payment receipts, delivery slips, bank statements.
- Any change to Odoo forms, menus or business flows.
- Consolidated `external_layout_modern` refactor (other reports keep the theme letterhead).
- Localisation-specific layouts beyond the dynamic columns described in §6.

## 4. Module structure

New addon `modern_reports`, version `19.0.1.0.0`, depends `modern_theme`, `account`, `sale`,
`purchase`. `invoice_modern` / `sales_modern` / `purchase_modern` are UI-only and are not touched.

```
modern_reports/
├── __manifest__.py, __init__.py
├── models/
│   ├── __init__.py
│   ├── res_company.py            # colours, effective style helper
│   ├── res_config_settings.py    # related settings fields
│   ├── account_move.py           # helpers: titles, rows, tax columns, words, optional l10n fields
│   ├── sale_order.py             # same helpers for sale.order
│   └── purchase_order.py         # same helpers for purchase.order
├── views/
│   ├── res_company_views.xml
│   └── res_config_settings_views.xml
├── report/
│   ├── paperformat.xml
│   ├── document_page.xml         # page chrome + shared partials
│   ├── document_invoice.xml      # inherit account.report_invoice_document
│   ├── document_sale_order.xml   # inherit sale.report_saleorder_document
│   ├── document_purchase_order.xml
│   ├── copy_wrappers.xml         # proforma + copy templates
│   └── report_actions.xml        # paperformats on core actions + 6 new print actions
├── static/src/scss/document.scss # in web.report_assets_common
└── tests/test_document_helpers.py
```

## 5. Template architecture

All four documents keep Odoo's report actions, domains, filters and proforma mechanics. Only the
document body is replaced, by inheriting each core document template and replacing its
`t-call="web.external_layout"` node (the stable public anchor) with the modern page:

- `account.report_invoice_document` → covers invoice, credit note, vendor bill, proforma flag,
  payment box.
- `sale.report_saleorder_document` → shared by quotation/order and the proforma wrapper.
- `purchase.report_purchaseorder_document` → shared by RFQ and purchase order.

The replacement is a `position="replace"` xpath on that node: it drops the core body and calls
`modern_reports.document_page` with `mr_doc` (the document), `copy_label` and `proforma`
template variables. The page dispatches its body partial on `mr_doc._name`, so the same page
serves all models.

Page chrome (`modern_reports.document_page`) renders:

1. `.header` — 3-cell bordered table: logo, company block, copy strip. Odoo repeats `.header`
   on every printed page via wkhtmltopdf.
2. Body — title band, meta grid, parties, item table, totals, bank/terms, signature, rendered by
   the per-document body partial (`body_account_move`, `body_sale_order`,
   `body_purchase_order`).
3. `.footer` — head office / tax IDs, `Page X/Y` (`.page` / `.topage`), repeated on every page.

Title: because Odoo renders its own `layout_document_title` inside the replaced layout node, the
title comes from a small helper `mr_document_title()` per model, replicating Odoo's exact rules
(same English wording, translated):

- Invoice: Invoice / Draft Invoice / Cancelled Invoice, Credit Note variants, Vendor Bill /
  Vendor Credit Note, self-billing variants; all Proforma variants when the `proforma` flag is
  set (our proforma wrappers set it; core email fallback sets it via report data).
- Sale order: Quotation (draft/sent) / Sales Order, Pro-Forma Invoice when `is_pro_forma` or the
  proforma context is set.
- Purchase order: Request for Quotation / Purchase Order by state.

The document number is not part of the band; it lives in the meta grid (as in the reference
format). The band uppercases the title via CSS.

Copy label: the page reads `copy_label` with an "Original" fallback (undefined variables evaluate
falsy in Odoo QWeb — the same tolerance core templates rely on). The six new wrapper templates
follow Odoo's own proforma pattern (`sale.report_saleorder_pro_forma`): a thin template sets
`copy_label` / `proforma` before calling the core chain, so variables flow down the `t-call`
chain without any Python changes.

- Invoice copy N: `t-call="account.report_invoice_with_payments"` + `copy_label`
  (keeps the payment box and all core filters).
- Proforma copy N: `t-call="account.report_invoice"` + `copy_label` + `proforma = True`
  (no payment box; proforma titles from core template logic).

New print actions (bound to `account.move`, domain `move_type in (out_invoice, out_refund)`,
groups `account.group_account_invoice` + `account.group_account_readonly`):

| Menu name | report_name |
|---|---|
| Invoice – Original | `modern_reports.report_invoice_original` |
| Invoice – Duplicate | `modern_reports.report_invoice_duplicate` |
| Invoice – Triplicate | `modern_reports.report_invoice_triplicate` |
| Proforma Invoice – Original | `modern_reports.report_invoice_proforma_original` |
| Proforma Invoice – Duplicate | `modern_reports.report_invoice_proforma_duplicate` |
| Proforma Invoice – Triplicate | `modern_reports.report_invoice_proforma_triplicate` |

Core actions are left untouched except for `paperformat_id`. SO and PO copies are not added; the
header box shows "Original" active. Filenames keep `_get_report_base_filename()` with a
`_duplicate` / `_triplicate` suffix.

Paperformat: new A4 record — starting values top 30 mm, bottom 18 mm, left/right 8 mm, header
spacing 3 mm (tuned while verifying PDFs so the repeating header/footer never overlap content) —
set on `account.account_invoices`, `account.account_invoices_without_payment`,
`sale.report_saleorder`, `sale.action_report_pro_forma_invoice`, the PO print action and the six
new copy actions.

## 6. Page blueprint

### Header (repeats on every page)

| Cell | Content |
|---|---|
| Left | Company logo (~18–20 mm tall); monogram of the company name when no logo is set |
| Center | Company name (bold), street/address, phone, email, Tax ID / GSTIN / VAT (label from `account_fiscal_country_id.vat_label`), CIN/registry if set |
| Right | Copy strip: Original / Duplicate / Triplicate; active copy bold with accent bar, others muted |

### Body

1. **Title band** — accent background, white centered text, 14–16 pt: `layout_document_title`.
2. **Meta grid** — bordered 2-column table, labels uppercase micro-text:

| Document | Fields |
|---|---|
| Invoice / Credit note | Invoice No, Invoice Date, Due Date (posted), Customer No (`partner.ref`), Payment Terms, Salesperson; + Place of Supply, Reverse Charge, Transport/Vehicle when `l10n_in` fields exist |
| Invoice proforma | Same as invoice; the Paid / Amount Due block is omitted |
| Sales Order / Quotation | Order No, Order Date, Validity, Salesperson, Payment Terms, Pricelist, Customer Ref |
| Purchase Order / RFQ | PO No, Order Date, Vendor Ref, Expected Arrival, Payment Terms, Buyer, Incoterm |

3. **Parties** — two bordered boxes side by side:

| Document | Left box | Right box |
|---|---|---|
| Invoice / SO | Bill To: invoice/order partner (name, address, phone, email, Tax ID) | Ship To: `partner_shipping_id`, or "—" |
| Vendor bill | Vendor: partner | Bill reference / due date summary |
| PO | Vendor: partner | Ship To: `dest_address_id`, or "—" |

4. **Item table** — accent-tinted header row, 7.5 pt, right-aligned numbers, repeated `<thead>`,
   `page-break-inside: avoid` on rows.

| Column | Shown when |
|---|---|
| S.No | always |
| Description (`line.name`) | always |
| HSN | the field exists on the line model **and** any line has a value |
| UOM | always (`product_uom`/`product_uom_id`) |
| Qty | always |
| Unit Price | always |
| Amount (Qty × Unit Price) | always |
| Disc % + Taxable Value | any line has discount > 0 (taxable = `price_subtotal`) |
| One Rate %/Amount pair per tax group | tax groups exist; ordered by first appearance; per-line rate is that line's percentage for the group |
| Total | always (`price_total`, incl. tax) |

Column widths via `<colgroup>`; the layout must stay on one A4 width in the worst case
(3 tax pairs + discount + HSN) by using compact cells.

5. **Totals** — left: "Total invoice amount in words" box (hidden when the helper returns "");
   right: rows built only from Odoo's computed `tax_totals`:
   Subtotal → each tax group (with base when it differs) → Total Tax → Grand Total →
   Paid / Amount Due (only when `print_with_payments` and core's posted/payment conditions hold).
   Credit notes render negative amounts; words handle the sign.
6. **Bank & terms** — left box: company bank accounts (`name`, account number, IBAN/BIC);
   hidden when none. Payment terms and the document's terms text below.
7. **Signature** — right box: "Certified that the particulars given above are true and correct",
   "For {company}", signature line, "Authorised signatory".
8. **Footer** — head-office address, Tax ID / CIN, page counter. 8 pt muted. No "Powered by".

## 7. Settings and theming

New fields on `res.company`:

- `mr_doc_accent_color` — char, hex `#rrggbb`, default empty → effective accent falls back to
  `mt_primary_color`.
- `mr_doc_background` — selection: `white` (default), `tint` (RGB mix of accent and white, ~8 %),
  `custom`.
- `mr_doc_background_color` — char hex, default `#ffffff`, used when `custom`.

`res.config.settings` gets the three related fields (readonly=False) inside the existing theme
colours block so they appear in Settings ▸ Companies. A constraint validates hex values, mirroring
`modern_theme`'s colour constraint.

`res.company.mr_doc_style()` returns plain hex values (accent, background, soft tint, border,
muted text) computed in Python. wkhtmltopdf has no CSS-variable support, so the page template
injects them with `t-att-style` / a generated `<style>` block; the shared SCSS handles layout,
typography and spacing only.

## 8. Print constraints (wkhtmltopdf)

- Tables and floats only — no CSS grid or flexbox in the report stylesheet.
- No CSS custom properties; concrete colours per document.
- Font stack `Arial, Helvetica, sans-serif`; print-safe borders (no shadows/transparency).
- A4 paperformat with repeating header/footer via `.header`/`.footer` classes and
  `.page`/`.topage` counters.
- All styles live in `static/src/scss/document.scss` inside `web.report_assets_common`.

## 9. Feature preservation

- Titles, proforma flags, draft/cancelled states, vendor-bill wording and the SO proforma
  setting follow Odoo's rules exactly (helper replicates core wording; proforma flags read from
  the same variables core uses).
- Money values come only from Odoo's computed totals (`tax_totals`, `amount_residual`,
  `price_subtotal`, `price_total`); nothing is recalculated in QWeb.
- Amount in words uses `num2words` (already an Odoo dependency) plus the currency's
  unit/subunit labels; empty string disables the row.
- Optional `l10n_in` fields (HSN, reverse charge, vehicle, place of supply) are read only when
  the field exists on the model (`'field' in model._fields`), so the addon never depends on the
  Indian localisation.
- Multi-company/multi-currency: each document uses its own company, currency and logo.
- Missing bank accounts, logo, terms or discounts hide their blocks instead of printing empties.

## 10. Testing and verification

Local (`odoo_local`, `-i modern_reports`):

1. Render PDFs for: posted invoice, draft invoice, credit note, vendor bill, invoice proforma
   (each copy), quotation, sales order, SO proforma (with the Sales setting on), RFQ,
   purchase order. Inspect every PDF page visually and compare totals/taxes with the form UI.
2. Confirm: copy label changes per action; accent/background changes after setting the company
   fields; multi-page table header repeats; header/footer repeat; no "Powered by"/watermark;
   vendor bill and refund titles correct.
3. Regression: core print entries, "PDF without Payment", send & print fallback
   (`_get_invoice_pdf_proforma`) still produce documents.
4. Unit tests for helpers: amount in words, tax column grouping/order, discount column detection.

Deployment after user approval: commit + push, then one-time install `modern_reports` on the
production DBs (`crm`, `olee`, `rebelsoft`) via the existing deployment script, followed by a
visual check of the four documents on `crm.ibitltd.com`.

## 11. Risks

- wkhtmltopdf CSS limits — mitigated with tables and inline colours.
- Core xpath anchors — only the public `t-call="web.external_layout"` node in each document
  template is replaced; stable across versions.
- Six extra print entries for invoices — accepted; core entries remain unchanged.
- Odoo 19 CE has no proforma print entry for invoices — we add it explicitly, which the user
  asked for.
- If `l10n_in` is ever installed, its own template xpaths may target nodes we replaced; the
  Indian fields are still read for columns, and this is verified during testing if the module is
  present.

## 12. Open questions

None — all decisions above were confirmed with the user on 2026-11-25.
