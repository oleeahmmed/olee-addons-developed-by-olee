# Modern Purchase (`purchase_modern`)

A simple, modern workspace for Odoo 19's **Purchase** app. No new app, no new tables or fields.

* **Dashboard** (first page of the app): spend, orders, average order, vendors, RFQ → order
  rate, open RFQs; spend per month this year vs last year; what to chase (RFQs without
  answer, orders to bill, late receipts when Inventory is installed, overdue bills); spend by
  category and region; money out (billed, paid, payables by age) for users who may read bills;
  top buyers, vendors and products; latest orders. The "to bill" value counts only the
  quantity still to bill on each line.
* **Buy**: Requests for Quotation (Odoo's own RFQ views), Purchase Orders, To Bill, Vendors.
* **Catalog**: Products, Product Variants. Reporting and Configuration (with Vendor
  Pricelists) at the bottom of the sidebar.
