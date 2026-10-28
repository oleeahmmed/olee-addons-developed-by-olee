# Modern POS

Odoo 19 Community — the back office of Point of Sale with the look of Modern CRM.

* **Sidebar** (everyday work): Dashboard, Shops, Orders, Sessions, Products, Customers.
* **Top bar**: More (Payments, Refunds, Ongoing orders, Odoo's Preparation Printers),
  Odoo's Reporting and Configuration (PoS Product Categories open in the CRM drawer).
* **Shops**: CRM-style cards with the session state, today's figures, the cashier and
  Odoo's own Open Register / Continue Selling / Close buttons (the cashier screen is Odoo's).
* **Orders / Sessions / Payments**: Odoo's own lists, filters, pivot and forms.
* **Products / Customers**: "New" opens the CRM drawer (product: name, price, barcode,
  PoS categories; customer: person or company, phone, email, address); existing records
  open as Odoo's own full page.
* **Dashboard**: revenue, orders, average basket, customers, refunds, open sessions,
  revenue per month, what needs attention, best sellers, sales per shop and per payment
  method, the shops right now and the latest orders. Amounts in Taka read the Bangladeshi
  way (lakh / crore).

No new table or field: everything uses Odoo's pos.config, pos.session, pos.order,
pos.payment, products and contacts, with Odoo's own rights. The cards are standalone views
(no xpath into Odoo's), so an Odoo update cannot break them.

Depends on `modern_theme` and `point_of_sale`.
