# Modern Invoicing (`invoice_modern`)

A simple, modern workspace for Odoo 19's **Invoicing** app, in the same design as the other
modern apps. No new app, no new tables or fields: it lives inside the Invoicing app (opening
Invoicing opens its dashboard) and every screen uses Odoo's own `account.move` /
`account.payment` views, forms, wizards and reports.

| Sidebar page | What it shows |
|---|---|
| Dashboard | invoiced, received, customers owe, billed, paid, we owe (company currency, untaxed for invoiced / billed) with the previous period; invoiced per month this year vs last year; what to do now (draft invoices, invoices not sent, overdue invoices, draft bills, bills due within 7 days, overdue bills); money to collect and to pay by age (not due, 1–30, 31–60, 61–90, 90+ days) with the most overdue customers and the vendors we owe most; latest invoices |
| Customers ▸ Invoices / Credit Notes / Payments Received | Odoo's own lists, kanban and activity views with exactly the domains, default filters and defaults of Odoo's Invoicing menus |
| Vendors ▸ Bills / Refunds / Payments Made | the same for vendors |
| Products, Customers, Vendors | Odoo's own menus, merged into the two groups |
| Reporting, Configuration (and the accountant menus) | Odoo's own, at the bottom of the sidebar. Odoo's journal dashboard (accountants) is under Reporting |

Payments figures only show for users allowed to read payments. Rights, record rules,
journals, taxes, sequences and printed invoices are Odoo's own.
