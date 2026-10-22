# Modern Accounting (Odoo 19 Community)

An **Accounting** app in the sidebar, made for the accountant. It only arranges
Odoo's own accounting: no new model, table or field.

## Sidebar (everyday work)

| Group | Page | What it is (Odoo's own) |
|---|---|---|
| — | Dashboard | Income, expenses, profit, cash & bank, receivable, payable; what to check; bank balances; expenses by account; latest entries |
| Daily Work | Journal Entries | `account.move` (all journals) |
| | Journal Items | `account.move.line` list / pivot / graph |
| | Payments | `account.payment` (in, out, transfers) |
| | Analytic Items | when Analytic Accounting is on |
| | Journals Overview | Odoo's journal dashboard |
| Ledgers | Chart of Accounts | `account.account` with balances |
| | General Ledger | journal items grouped by account |
| | Partner Ledger | open receivable / payable items by partner |
| | Cash & Bank Book | items of the bank / cash accounts, by account |
| | Trial Balance | pivot: debit, credit, balance per account |

## Top bar

* **Reporting** — Profit & Loss, Balance Sheet, Tax Report (pivots of journal
  items), Invoice Analysis, Analytic Report, Audit Trail.
* **Configuration** — Settings, Journals, Taxes, Fiscal Positions, Currencies,
  Payment Terms, Reconciliation Models, analytic setup, Secure Entries.

Every page uses Odoo's own search: filter by date, journal, partner; group by;
export; switch list / pivot / graph.

## Rights

* The app is visible to **Show Accounting Features – Readonly** (and above).
* Like Odoo's Accounting app, installing it makes **Invoicing / Administrator**
  imply **Show Full Accounting Features**. Other bookkeepers get that group on
  their user form. Uninstalling removes the implication again.
* Odoo's Accounting and Review menus are no longer repeated in the Invoicing app
  while this app is visible (theme registry `modern_theme.moved_menus`).

Requires `modern_theme`. Invoices and bills stay in the Invoicing app.
