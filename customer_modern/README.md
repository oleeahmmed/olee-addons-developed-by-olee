# Modern Contacts (`customer_modern`)

A simple, modern workspace for Odoo 19's **Contacts** app, in the same design as the other
modern apps. No new app, no new tables or fields: it lives inside the Contacts app (opening
Contacts opens its dashboard) and every screen uses Odoo's own `res.partner` views and form.

| Sidebar page | What it shows |
|---|---|
| Dashboard | contacts, companies, people, new contacts this period (with trend), customers and vendors; new contacts per month this year vs last year; what to tidy up (no email, no phone, overdue activities, blacklisted emails); contacts by country, city and tag; latest contacts. With **Sales**: best customers. With **Purchase**: main vendors. With **Invoicing** (and the right to read invoices): what customers owe and who is overdue |
| All Contacts | Odoo's contact kanban, list and activity views, with Odoo's search, filters, group by and export |
| Companies / People | the same, for companies or individuals only |
| Customers / Vendors | Odoo's customer / vendor mode (sorted by rank). Shown only when Invoicing is installed |
| Configuration | Odoo's own menu (tags, industries, countries, banks…), at the bottom of the sidebar |

Every figure is read with the user's own rights and record rules. Business figures only
appear when the app behind them is installed and readable by the user.
