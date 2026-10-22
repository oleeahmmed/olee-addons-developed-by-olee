# Manufacturing Modern (`mrp_modern`)

A simple, modern workspace for Odoo 19's **Manufacturing** app. No new app, no new tables or fields.

* **Dashboard** (first page of the app): finished orders, quantity produced (in each
  product's own unit), open / in progress orders, started → done rate, late orders (deadline
  passed); finished orders per month this year vs last year; what needs attention (late,
  waiting for components, ready to close, drafts, open work orders); most produced products;
  bills of materials; latest orders.
* **Operations**: To Do, Manufacturing Orders, Done, Unbuild Orders, Work Orders (with work
  orders enabled; created from their manufacturing order, as in Odoo), Scrap.
  **Products**: Products (goods filter, as in Odoo), Bills of Materials, Variants, Lots.
  Reporting and Configuration at the bottom of the sidebar.
