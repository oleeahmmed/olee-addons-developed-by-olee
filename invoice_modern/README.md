# Modern Invoicing (`invoice_modern`)

A simple, modern workspace for Odoo 19's **Invoicing** app, in the same design as the other
modern apps. No new app, no new tables or fields: it lives inside the Invoicing app (opening
Invoicing opens the Invoices list) and every screen uses Odoo's own `account.move` /
`account.payment` views, forms, wizards and reports. The app has no dashboards.

| Sidebar page | What it shows |
|---|---|
| Invoices | Odoo's own list, kanban and activity views with exactly the domains, default filters and defaults of Odoo's Invoicing menu |
| Bills | the same for vendor bills |
| Payments ▸ Received / Made | incoming and outgoing payments |
| Contacts ▸ Customers / Vendors | Odoo's partner lists (same actions as Odoo's menus) |
| Products ▸ For Sale / For Purchase | Odoo's product lists |
| Accounting | a short, flat list: journal entries, general ledger, trial balance, P&L, balance sheet, tax report |
| More (top bar) | credit notes, refunds, journal items, all payments, journals overview, analytic items, chart of accounts, partner ledger, cash & bank book, invoice analysis, analytic report, audit trail |
| Reporting, Configuration (top bar) | Odoo's own menus |

Payments figures only show for users allowed to read payments. Rights, record rules,
journals, taxes, sequences and printed invoices are Odoo's own.
