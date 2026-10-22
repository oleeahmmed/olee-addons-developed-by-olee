import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";

export { openFullForm };

const VIEW_IDS = { model: "stock.picking", method: "inventory_modern_view_ids" };
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
    static cssPrefix = "im";
    static storagePrefix = "inventory_modern";
    static viewIds = VIEW_IDS;
}

// --------------------------------------------------------------------------- pages

const PICKING_VIEWS = ["list", "kanban", "calendar", "activity"];

/** Receipts, deliveries and internal transfers: Odoo's own transfer views, one type each. */
class TransferPage extends ListPage {
    static resModel = "stock.picking";
    static types = PICKING_VIEWS;
    static code = "";
    get domain() {
        const wh = this.ctx.inventory_modern_warehouse_id;
        return [["picking_type_code", "=", this.constructor.code], ...(wh ? [["picking_type_id.warehouse_id", "=", Number(wh)]] : [])];
    }
    get context() {
        // same context as Odoo's Inventory ▸ Operations menus: "New" creates the right type
        return { contact_display: "partner_address", restricted_picking_type_code: this.constructor.code };
    }
}

class ReceiptsPage extends TransferPage {
    static title = _t("Receipts");
    static subtitle = _t("Goods coming in from vendors — check, receive, validate");
    static icon = "fa-download";
    static newLabel = _t("New receipt");
    static prefix = "receipt";
    static code = "incoming";
    static emptyTitle = _t("No receipt yet");
    static emptyText = _t("Receipts from your vendors (or purchase orders) show up here.");
}

class DeliveriesPage extends TransferPage {
    static title = _t("Deliveries");
    static subtitle = _t("Goods going out to customers — pick, pack, deliver");
    static icon = "fa-truck";
    static newLabel = _t("New delivery");
    static prefix = "delivery";
    static code = "outgoing";
    static emptyTitle = _t("No delivery yet");
    static emptyText = _t("Deliveries to your customers (or from sales orders) show up here.");
}

class InternalPage extends TransferPage {
    static title = _t("Internal Transfers");
    static subtitle = _t("Moves between your own locations and warehouses");
    static icon = "fa-exchange";
    static newLabel = _t("New transfer");
    static prefix = "internal";
    static code = "internal";
    static emptyTitle = _t("No internal transfer yet");
    static emptyText = _t("Move stock between locations; it shows up here.");
}

class ProductsPage extends ListPage {
    static title = _t("Products");
    static subtitle = _t("What you stock — on hand, forecast, routes and reordering");
    static icon = "fa-cube";
    static newLabel = _t("New product");
    static resModel = "product.template";
    static prefix = "product";
    static types = ["kanban", "list"];
    static emptyTitle = _t("No product yet");
    static emptyText = _t("Add the goods you buy, store and sell.");
    get context() {
        // Odoo's Inventory ▸ Products defaults
        return { search_default_goods: 1, default_is_storable: true };
    }
}

class StockPage extends ListPage {
    static title = _t("Stock on Hand");
    static subtitle = _t("What is on the shelves, per product and location");
    static icon = "fa-cubes";
    static resModel = "stock.quant";
    static prefix = "quant";
    static types = ["list", "pivot"];
    static allowCreate = false;
    static emptyTitle = _t("Nothing in stock");
    static emptyText = _t("Validate a receipt or an inventory adjustment to see stock here.");
    get domain() {
        return [["location_id.usage", "=", "internal"]];
    }
    get context() {
        return { create: false, search_default_productgroup: 1, pivot_measures: ["quantity"] };
    }
}

class MovesPage extends ListPage {
    static title = _t("Moves History");
    static subtitle = _t("Every unit that came in, went out or moved — who, when, where");
    static icon = "fa-history";
    static resModel = "stock.move.line";
    static prefix = "moveline";
    static types = ["list", "kanban", "pivot"];
    static allowCreate = false;
    static emptyTitle = _t("No move yet");
    static emptyText = _t("Validated receipts, deliveries and adjustments are listed here.");
    get domain() {
        return [["state", "=", "done"]];
    }
    get context() {
        return { create: false, pivot_measures: ["quantity_product_uom", "__count__"] };
    }
}

const actions = registry.category("actions");
actions.add("inventory_modern.receipts", ReceiptsPage);
actions.add("inventory_modern.deliveries", DeliveriesPage);
actions.add("inventory_modern.internal", InternalPage);
actions.add("inventory_modern.products", ProductsPage);
actions.add("inventory_modern.stock", StockPage);
actions.add("inventory_modern.moves", MovesPage);
