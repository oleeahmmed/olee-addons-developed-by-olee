# Inventory Modern (`inventory_modern`)

A simple, modern workspace for Odoo 19's **Inventory** app. No new app, no new tables or fields.

* **Dashboard** (first page of the app), per warehouse or for all: stock value at cost
  (each company's own cost, converted to the current company's currency), products in / out
  of stock, products to reorder (Odoo's Replenishment rules, automatic and manual, not
  snoozed), units delivered / received in the product's own unit; operations at a glance
  (internal transfers only with multi-locations); what needs attention; stock by category and
  warehouse; best movers and sleeping stock.
* **Operations**: Receipts, Deliveries, Internal (multi-locations), plus Odoo's Overview,
  Transfers, Adjustments and Procurement. **Products**: Products, Stock on Hand, Moves History,
  Variants, Lots / Serial Numbers. Reporting and Configuration at the bottom.
