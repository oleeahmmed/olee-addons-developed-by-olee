import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";

export { openFullForm };

const VIEW_IDS = { model: "sale.order", method: "sales_modern_view_ids" };
/** View ids of this app's pages (fetched once per page load). */
export function loadViewIds(orm) {
    return kitLoadViewIds(orm, VIEW_IDS);
}

/**
 * Pages of this app: Odoo's own views (search, filters, group by, pager, export,
 * view switcher) in the shared modern page of modern_theme (js/app_kit/list_page.js).
 * Subclasses only describe the model, views, domain, context and open / new.
 */
export class ListPage extends KitListPage {
    static cssPrefix = "ss";
    static storagePrefix = "sales_modern";
    static viewIds = VIEW_IDS;
}

// --------------------------------------------------------------------------- pages

const ORDER_VIEWS = ["list", "kanban", "calendar", "pivot", "graph", "activity"];

/** Opened from a team card: only that team's records, and new ones belong to it. */
function teamDomain(ctx) {
    return ctx.sales_modern_team_id ? [["team_id", "=", Number(ctx.sales_modern_team_id)]] : [];
}
function teamContext(ctx) {
    return ctx.sales_modern_team_id ? { default_team_id: Number(ctx.sales_modern_team_id) } : {};
}

class QuotationsPage extends ListPage {
    static title = _t("Quotations");
    static emptyTitle = _t("No open quotation");
    static emptyText = _t("Create one in a few seconds: pick the customer, add products, send it.");
    static subtitle = _t("Offers waiting for the customer — send, follow up, confirm");
    static icon = "fa-file-text-o";
    static newLabel = _t("New quotation");
    static resModel = "sale.order";
    static prefix = "quotation";
    static types = ORDER_VIEWS;
    get domain() {
        return [["state", "in", ["draft", "sent"]], ...teamDomain(this.ctx)];
    }
    get context() {
        return teamContext(this.ctx);
    }
}

class OrdersPage extends ListPage {
    static title = _t("Sales Orders");
    static emptyTitle = _t("No sales order yet");
    static emptyText = _t("Confirmed quotations become sales orders and show up here.");
    static subtitle = _t("Confirmed orders — deliver, invoice and follow payment");
    static icon = "fa-shopping-cart";
    static newLabel = _t("New order");
    static resModel = "sale.order";
    static prefix = "order";
    static types = ORDER_VIEWS;
    static viewKey = "sales_modern.view.order.list";
    get domain() {
        return [["state", "=", "sale"], ...teamDomain(this.ctx)];
    }
    get context() {
        return teamContext(this.ctx);
    }
}

class ToInvoicePage extends ListPage {
    static title = _t("To Invoice");
    static emptyTitle = _t("Nothing to invoice");
    static emptyText = _t("Orders appear here as soon as something can be invoiced.");
    static subtitle = _t("Orders with something left to invoice — select them, then Actions ▸ Create invoices");
    static icon = "fa-file-text";
    static resModel = "sale.order";
    static prefix = "invoice";
    static types = ["list", "kanban", "pivot", "graph"];
    static allowCreate = false;
    get domain() {
        return [["invoice_status", "=", "to invoice"], ...teamDomain(this.ctx)];
    }
    get context() {
        return { ...teamContext(this.ctx), create: false };
    }
}

class CustomersPage extends ListPage {
    static title = _t("Customers");
    static emptyTitle = _t("No customer yet");
    static emptyText = _t("Add the people and companies you sell to.");
    static subtitle = _t("Everyone you sell to — open one to see their orders and invoices");
    static icon = "fa-address-book-o";
    static newLabel = _t("New customer");
    static resModel = "res.partner";
    static prefix = "customer";
    static types = ["kanban", "list", "activity"];
    get context() {
        // Odoo's Sales ▸ Customers defaults, without the "Customer Invoices" filter (customer_rank
        // only grows once an invoice is posted, which would hide customers you just quoted)
        return { res_partner_search_mode: "customer", default_is_company: true, default_customer_rank: 1 };
    }
}

class ProductsPage extends ListPage {
    static title = _t("Products");
    static emptyTitle = _t("No product to sell yet");
    static emptyText = _t("Add what you sell, with its price and taxes.");
    static subtitle = _t("What you sell, with prices, taxes and variants");
    static icon = "fa-cube";
    static newLabel = _t("New product");
    static resModel = "product.template";
    static prefix = "product";
    static types = ["kanban", "list"];
    get context() {
        return { search_default_filter_to_sell: 1, default_sale_ok: true, sale_multi_pricelist_product_template: 1 };
    }
}

class TeamsPage extends ListPage {
    static title = _t("Sales Teams");
    static subtitle = _t("Leaders, salespeople, quotations and what each team sold this month");
    static icon = "fa-users";
    static newLabel = _t("New team");
    static emptyTitle = _t("No sales team yet");
    static emptyText = _t("Group your salespeople into teams to follow their quotations and orders.");
    static resModel = "crm.team";
    static prefix = "team";
    static types = ["kanban", "list"];
}

class SalespeoplePage extends ListPage {
    static title = _t("Salespeople");
    static subtitle = _t("Who sells in which team");
    static icon = "fa-user";
    static newLabel = _t("Add salesperson");
    static emptyTitle = _t("No salesperson yet");
    static emptyText = _t("Add users to a sales team to make them salespeople.");
    static resModel = "crm.team.member";
    static prefix = "member";
    static types = ["kanban", "list"];
}

const actions = registry.category("actions");
actions.add("sales_modern.quotations", QuotationsPage);
actions.add("sales_modern.orders", OrdersPage);
actions.add("sales_modern.to_invoice", ToInvoicePage);
actions.add("sales_modern.customers", CustomersPage);
actions.add("sales_modern.products", ProductsPage);
actions.add("sales_modern.teams", TeamsPage);
actions.add("sales_modern.salespeople", SalespeoplePage);
