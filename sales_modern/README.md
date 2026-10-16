# Sales Modern (`sales_modern`)

(Formerly `simple_sales`.)

A simple, modern workspace for Odoo 19's **Sales** app, in the same design as Modern CRM.
No new app, no new tables or fields: it lives inside the Sales app (opening Sales from
the home screen opens its dashboard) and every screen uses Odoo's own models, views,
wizards and methods.

| Sidebar page | What it uses |
|---|---|
| Dashboard | `sale.order` counts, `sale.report` amounts (company currency): open quotations, sold this month, to invoice, quote → order rate, 6-month trend, best-selling products, top customers, quotations to follow up, orders ready to invoice |
| Quotations / Sales Orders | Odoo's sale.order list, kanban, calendar, pivot, graph and activity views with search, filters, export and actions; records open in Odoo's full quotation form |
| To Invoice | orders with `invoice_status = to invoice`; select them, then Actions ▸ Create invoices (Odoo's invoice wizard) |
| Customers | Odoo's `res.partner` kanban, list, pivot, graph and activity views, search and filters; details in Odoo's customer form |
| Products | Odoo's `product.template` kanban and list views and form |
| Sales Teams | team cards (view `sales_modern.crm_team_kanban_sales_modern`): leader, salespeople (managers add / remove on the card), open quotations, quoted amount, sold this month, invoiced vs target; list, pivot, graph; Odoo's team form |
| Salespeople | Odoo's `crm.team.member` kanban, list, pivot and graph views and form |
| Every other Sales menu | shown in the sidebar exactly as Odoo defines it: Orders to Upsell, Sales Teams, Reporting, the whole Configuration (Settings, Quotation Templates, Tags, Products, UoM, Online Payments, Activities...), and menus other apps add to Sales (e.g. Inventory). Odoo's groups and Settings decide what each user sees |

**List pages use Odoo's own layout**, full width: the control panel (New, title, search,
filters, pager, view switcher) and the view right below it.

**Add, view and edit look the same**: every "New …" button opens the same Odoo form
used to view and edit the record (sales information on top, Order Lines / Other Info
tabs below), so creating a quotation works exactly like Odoo, with every feature.

Those forms get a modern skin (CSS classes and variables only, no template changes):
white rounded sheet, outlined action buttons, the status steps as a segmented control,
underline tabs, a clean order-lines table, a totals card and a fixed-width chatter.

The sidebar (shadcn style) keeps the everyday pages; Team, Reporting, Configuration and groups other apps add
to Sales are compact dropdowns in the top bar.

## Printed documents: "Modern" layout
A new document layout (**Settings > Companies > Document Layout > Modern**), set on install
for companies still using Odoo's default Light layout. Every printed document uses it:
quotations, sales orders, pro-forma and invoices. Company logo, name, address, contact and
tax ID at the top with an accent line in the company colour; the document title; the
customer and order information as soft cards; a dark table header with striped lines and
section rows; a boxed totals summary with the grand total on a dark band; footer with the
company footer text and page numbers. Odoo's own document bodies are kept (lines, taxes,
discounts, payment terms, signatures), only the frame and the styling change.

## Rights
Everything runs as the user: menu groups, record rules (own / all documents) and access
rights are Odoo's. "New …" buttons only show when the user may create (e.g. products
need Sales Administrator rights). The server never uses `sudo()`.

## Install / update / upgrade check
```
odoo-bin -c odoo.conf -d <db> -i sales_modern --stop-after-init
odoo-bin -c odoo.conf -d <db> -u sales_modern --test-tags /sales_modern --stop-after-init
```
The tests check that every embedded view, action and report field still exists, that the
Sales app opens the dashboard, and run the quotation → send → confirm flow.

## Upgrade safety
* No template overrides of Odoo's web client: the sidebar is a standalone main component;
  the Sales top-bar menus are hidden with CSS.
* One defensive JS patch (ControlPanel.switchView) that falls back to Odoo for every
  normal view.
* Views are referenced by xml id with `raise_if_not_found=False`.
* Own CSS/JS prefixes (`o_ss`, `ss-`, `--ss-`), so it never clashes with Modern CRM.
