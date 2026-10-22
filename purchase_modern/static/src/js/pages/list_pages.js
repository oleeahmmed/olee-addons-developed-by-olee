import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";

export { openFullForm };

const VIEW_IDS = { model: "purchase.order", method: "purchase_modern_view_ids" };
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
    static cssPrefix = "mp";
    static storagePrefix = "purchase_modern";
    static viewIds = VIEW_IDS;
}

// --------------------------------------------------------------------------- pages

const ORDER_VIEWS = ["list", "kanban", "calendar", "pivot", "graph", "activity"];

class RfqPage extends ListPage {
    static title = _t("Requests for Quotation");
    static emptyTitle = _t("No request for quotation");
    static emptyText = _t("Create one in a few seconds: pick the vendor, add products, send it.");
    static subtitle = _t("Offers waiting for a vendor reply — send, follow up, confirm");
    static icon = "fa-file-text-o";
    static newLabel = _t("New RFQ");
    static resModel = "purchase.order";
    static prefix = "rfq";
    static types = ORDER_VIEWS;
    get domain() {
        return [["state", "in", ["draft", "sent", "to approve"]]];
    }
    get context() {
        return { quotation_only: true }; // as Odoo's own RFQ menu
    }
}

class OrdersPage extends ListPage {
    static title = _t("Purchase Orders");
    static emptyTitle = _t("No purchase order yet");
    static emptyText = _t("Confirmed RFQs become purchase orders and show up here.");
    static subtitle = _t("Confirmed orders — receive, bill and follow payment");
    static icon = "fa-shopping-cart";
    static newLabel = _t("New order");
    static resModel = "purchase.order";
    static prefix = "order";
    static types = ORDER_VIEWS;
    get domain() {
        return [["state", "=", "purchase"]];
    }
}

class ToBillPage extends ListPage {
    static title = _t("To Bill");
    static emptyTitle = _t("Nothing to bill");
    static emptyText = _t("Orders appear here as soon as a vendor bill is expected.");
    static subtitle = _t("Orders with a vendor bill still expected");
    static icon = "fa-file-text";
    static resModel = "purchase.order";
    static prefix = "bill";
    static types = ["list", "kanban", "pivot", "graph"];
    static allowCreate = false;
    get domain() {
        return [["invoice_status", "=", "to invoice"]];
    }
    get context() {
        return { create: false };
    }
}

class VendorsPage extends ListPage {
    static title = _t("Vendors");
    static emptyTitle = _t("No vendor yet");
    static emptyText = _t("Add the people and companies you buy from.");
    static subtitle = _t("Everyone you buy from — open one to see their orders and bills");
    static icon = "fa-address-book-o";
    static newLabel = _t("New vendor");
    static resModel = "res.partner";
    static prefix = "vendor";
    static types = ["kanban", "list", "activity"];
    get context() {
        return { res_partner_search_mode: "supplier", default_is_company: true, default_supplier_rank: 1 };
    }
}

class ProductsPage extends ListPage {
    static title = _t("Products");
    static emptyTitle = _t("No product to buy yet");
    static emptyText = _t("Add what you purchase, with its cost and vendor.");
    static subtitle = _t("What you buy, with cost, vendor pricing and variants");
    static icon = "fa-cube";
    static newLabel = _t("New product");
    static resModel = "product.template";
    static prefix = "product";
    static types = ["kanban", "list"];
    get context() {
        return { search_default_filter_to_purchase: 1, default_purchase_ok: true };
    }
}

const actions = registry.category("actions");
actions.add("purchase_modern.rfqs", RfqPage);
actions.add("purchase_modern.orders", OrdersPage);
actions.add("purchase_modern.to_bill", ToBillPage);
actions.add("purchase_modern.vendors", VendorsPage);
actions.add("purchase_modern.products", ProductsPage);
