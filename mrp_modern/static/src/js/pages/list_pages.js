import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";

export { openFullForm };

const VIEW_IDS = { model: "mrp.production", method: "mrp_modern_view_ids" };
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
    static cssPrefix = "mr";
    static storagePrefix = "mrp_modern";
    static viewIds = VIEW_IDS;
}

const MO_VIEWS = ["list", "kanban", "calendar", "pivot", "graph", "activity"];

class ManufacturingOrdersPage extends ListPage {
    static title = _t("Manufacturing Orders");
    static emptyTitle = _t("No manufacturing order found. Let's create one.");
    static emptyText = _t("Use Manufacturing Orders to build finished products while consuming components.");
    static subtitle = _t("Every manufacturing order — draft, in progress and done");
    static icon = "fa-industry";
    static newLabel = _t("New manufacturing order");
    static resModel = "mrp.production";
    static prefix = "mo";
    static types = MO_VIEWS;
}

class TodoPage extends ListPage {
    static title = _t("To Do");
    static emptyTitle = _t("Nothing to manufacture");
    static emptyText = _t("Confirmed and in-progress orders show up here.");
    static subtitle = _t("Open manufacturing orders waiting to be produced");
    static icon = "fa-list";
    static newLabel = _t("New manufacturing order");
    static resModel = "mrp.production";
    static prefix = "todo";
    static types = MO_VIEWS;
    get domain() {
        return [["state", "in", ["draft", "confirmed", "progress", "to_close"]]];
    }
}

class DonePage extends ListPage {
    static title = _t("Done");
    static emptyTitle = _t("No finished order yet");
    static emptyText = _t("Closed manufacturing orders appear here.");
    static subtitle = _t("Manufacturing orders that have been produced");
    static icon = "fa-check-circle";
    static resModel = "mrp.production";
    static prefix = "done";
    static types = ["list", "kanban", "pivot", "graph"];
    static allowCreate = false;
    get domain() {
        return [["state", "=", "done"]];
    }
    get context() {
        return { create: false };
    }
}

class BomsPage extends ListPage {
    static title = _t("Bills of Materials");
    static emptyTitle = _t("No bill of materials found. Let's create one!");
    static emptyText = _t("A BoM lists the components used to make a finished product.");
    static subtitle = _t("How each finished product is built");
    static icon = "fa-sitemap";
    static newLabel = _t("New bill of materials");
    static resModel = "mrp.bom";
    static prefix = "bom";
    static types = ["list", "kanban"];
}

class UnbuildPage extends ListPage {
    static title = _t("Unbuild Orders");
    static emptyTitle = _t("No unbuild order found");
    static emptyText = _t("An unbuild order breaks a finished product back into its components.");
    static subtitle = _t("Disassemble finished products into components");
    static icon = "fa-undo";
    static newLabel = _t("New unbuild order");
    static resModel = "mrp.unbuild";
    static prefix = "unbuild";
    static types = ["list", "kanban", "activity"];
}

class WorkOrdersPage extends ListPage {
    static title = _t("Work Orders");
    static emptyTitle = _t("No work orders to do!");
    static emptyText = _t("Work orders are operations to do as part of a manufacturing order.");
    static subtitle = _t("Shop-floor operations on work centers");
    static icon = "fa-cogs";
    static newLabel = _t("New work order");
    static resModel = "mrp.workorder";
    static prefix = "wo";
    static types = ["list", "kanban", "calendar", "pivot", "graph"];
    // Work orders are created by their manufacturing order, as in Odoo
    static allowCreate = false;
    get context() {
        // Odoo's own Work Orders defaults: what is left to do
        return { create: false, search_default_ready: 1, search_default_progress: 1, search_default_blocked: 1 };
    }
}

class WorkCentersPage extends ListPage {
    static title = _t("Work Centers");
    static emptyTitle = _t("Create a new work center");
    static emptyText = _t("Operations are processed at work centers — machines, people or both.");
    static subtitle = _t("Where manufacturing operations run");
    static icon = "fa-wrench";
    static newLabel = _t("New work center");
    static resModel = "mrp.workcenter";
    static prefix = "wc";
    static types = ["kanban", "list"];
}

class ProductsPage extends ListPage {
    static title = _t("Products");
    static emptyTitle = _t("No product to manufacture yet");
    static emptyText = _t("Add the finished products you make, then give them a bill of materials.");
    static subtitle = _t("What you manufacture, with BoMs and variants");
    static icon = "fa-cube";
    static newLabel = _t("New product");
    static resModel = "product.template";
    static prefix = "product";
    static types = ["kanban", "list"];
    get context() {
        return { search_default_goods: 1, default_is_storable: true };
    }
}

const actions = registry.category("actions");
actions.add("mrp_modern.mos", ManufacturingOrdersPage);
actions.add("mrp_modern.todo", TodoPage);
actions.add("mrp_modern.done", DonePage);
actions.add("mrp_modern.boms", BomsPage);
actions.add("mrp_modern.unbuild", UnbuildPage);
actions.add("mrp_modern.workorders", WorkOrdersPage);
actions.add("mrp_modern.workcenters", WorkCentersPage);
actions.add("mrp_modern.products", ProductsPage);
