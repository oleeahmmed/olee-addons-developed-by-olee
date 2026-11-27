# Modern Contacts (`customer_modern`)

A simple, modern workspace for Odoo 19's **Contacts** app, in the same design as the other
modern apps. No new app, no new tables or fields: it lives inside the Contacts app (opening
Contacts opens All Contacts) and every screen uses Odoo's own `res.partner` views and form.

| Sidebar page | What it shows |
|---|---|
| All Contacts | Odoo's contact kanban, list and activity views, with Odoo's search, filters, group by and export |
| Companies / People | the same, for companies or individuals only |
| Customers / Vendors | Odoo's customer / vendor mode (sorted by rank). Shown only when Invoicing is installed |
| Configuration | Odoo's own menu (tags, industries, countries, banks…), at the bottom of the sidebar |

Every record is read with the user's own rights and record rules.
