# Modern POS

Odoo 19 Community — a fast, professional counter for every shop, with a Modern CRM
back office.

* **Sidebar** (everyday work): Menu, Tables, Orders. More: Shops, Sessions, Products,
  Customers, Damage / Scrap, Stock Adjustment.
* **Top bar**: More (Payments, Refunds, Ongoing orders, Odoo's Preparation Printers),
  Odoo's Reporting and Configuration (PoS Product Categories open in the CRM drawer).
* **Shops**: CRM-style cards with the session state, today's figures, the cashier and
  Odoo's own Open Register / Continue Selling / Close buttons.
* **Orders / Sessions / Payments**: Odoo's own lists, filters, pivot and forms.
* **Products / Customers**: "New" opens the CRM drawer (product: name, price, barcode,
  PoS categories; customer: person or company, phone, email, address); existing records
  open as Odoo's own full page.

## The counter (Menu)

The whole register sits in one rounded card: the header strip carries the breadcrumb,
the shop and the session state, **+ New**, **Order Menus** (return / exchange an earlier
bill), **Draft List** (held bills, F7), **Table Order** (restaurants) and small icons
for the rest (barcode labels, day end, the ⋯ stock tools, new product, settings).

The product side has "Search in products", an All Category select, "Show All" and
category pills, and a photo-first grid with the price and a round "+". The order rail
has "Search in Existing", the dining floor / table pickers (restaurants), "Order #n",
one card per line (stepper, remove, Add Notes, discount, note) and the summary
(Sub total, Product Discount, Extra Discount, Tax, Rounding, Total). The four footer
buttons are **KOT & Print** (kitchen ticket, no prices), **Draft** (hold),
**Bill & Payment** (split payment over cash / card / mobile wallets with change and
quick cash notes) and **Bill & Print** (take the payment, then print the 58 / 80 mm
receipt).

Repeat sale, hold / resume (F4 / F7), return and exchange, barcode labels (shop name,
code, price; in-store EAN-13 for products without a barcode), the offline queue and the
X / Z day end (opening, cash sales, expenses, expected, counted, over / short) all stay
on the counter.

The ⋯ menu on the counter adds the stock tools, all on Odoo's own documents:

* **Expense (cash out)** — a small daily expense from the drawer (Odoo cash move); the
  day-end expected cash drops by it, so the over / short stays right.
* **Damage / scrap** — damaged, expired or lost stock leaves the shop with Odoo's
  `stock.scrap` document and its stock move (`Damage / Scrap` lists them).
* **Stock adjustment** — type the counted quantity; Odoo's inventory adjustment
  (`stock.quant`) sets the shop's stock to it.

## Data

Orders, order lines, payments, sessions, cash moves, scraps and stock counts are Odoo's
own records (`pos.order`, `pos.payment`, `pos.session`, statement lines, `stock.scrap`,
`stock.quant`) with Odoo's own rights; this addon adds only the held bill
(`pos.modern.hold`) and the product modifier (`pos.modern.modifier`). The back-office
cards are standalone views (no xpath into Odoo's), so an Odoo update cannot break them.

Depends on `modern_theme` and `point_of_sale` (installed here from the `pos` folder of
the addons path).
