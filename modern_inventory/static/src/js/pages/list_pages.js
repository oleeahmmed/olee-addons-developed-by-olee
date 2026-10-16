import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { NativeView } from "../components/native_view";
import { PageBar } from "../components/page_bar";

let viewIdsPromise = null;
/** View ids are the same for every page and every user: fetch them once per page load. */
export function loadViewIds(orm) {
    viewIdsPromise ||= orm.call("stock.picking", "modern_inventory_view_ids", []).catch((e) => {
        viewIdsPromise = null;
        throw e;
    });
    return viewIdsPromise;
}

function readStoredView(key, fallback) {
    try {
        return window.localStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}
function storeView(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // storage unavailable (private window...)
    }
}

/** Open a record in Odoo's own full form (all buttons, smart buttons, chatter...). */
export function openFullForm(action, resModel, resId, { viewId = false, context = {} } = {}) {
    return action.doAction({
        type: "ir.actions.act_window",
        res_model: resModel,
        res_id: resId || false,
        views: [[viewId, "form"]],
        target: "current",
        context,
    });
}

/**
 * One list page = page header (title, purpose, "+ New …") and one card holding
 * Odoo's own views: control panel with search (filters / group by / favorites),
 * pager, action menu / export and the view switcher, then the view itself.
 * Subclasses only describe the model, its views, domain, context and what
 * "open" / "new" do.
 */
export class ListPage extends Component {
    static template = "modern_inventory.ListPage";
    static components = { NativeView, PageBar };
    static props = ["*"];

    static title = "";
    static subtitle = "";
    static icon = "";
    static newLabel = _t("New");
    static resModel = "";
    static types = ["list"];
    static prefix = ""; // key prefix in modern_inventory_view_ids, e.g. "order" → order_list
    static allowCreate = true;
    static emptyTitle = ""; // empty-list help, as in Odoo's own actions
    static emptyText = "";

    get domain() {
        return [];
    }
    get context() {
        return {};
    }
    open(resId) {
        return openFullForm(this.action, this.constructor.resModel, resId, { viewId: this.viewId("form") });
    }
    /** Add, view and edit all use the same full Odoo form, so they look the same. */
    create() {
        return openFullForm(this.action, this.constructor.resModel, false, {
            viewId: this.viewId("form"),
            context: this.context,
        });
    }

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.ctx = this.props.action?.context || {};
        const C = this.constructor;
        this.storageKey = `modern_inventory.view.${C.prefix || C.resModel}`;
        let view = readStoredView(this.storageKey, C.types[0]);
        if (!C.types.includes(view)) {
            view = C.types[0];
        }
        this.state = useState({ ready: false, view, viewIds: {}, version: 0, canCreate: false });
        onWillStart(async () => {
            const [viewIds, canCreate] = await Promise.all([
                loadViewIds(this.orm),
                C.allowCreate ? user.checkAccessRight(C.resModel, "create").catch(() => false) : false,
            ]);
            Object.assign(this.state, { viewIds, canCreate, ready: true });
        });
    }

    get page() {
        return this.constructor;
    }
    get pageTitle() {
        return this.props.action?.display_name || this.constructor.title;
    }
    get canCreate() {
        return this.state.canCreate;
    }
    onNew() {
        return this.create();
    }
    viewId(type) {
        const p = this.constructor.prefix;
        return (p && this.state.viewIds[`${p}_${type}`]) || false;
    }

    get nativeProps() {
        const C = this.constructor;
        const views = C.types.map((type) => [this.viewId(type), type]);
        views.push([this.viewId("search"), "search"]);
        const viewSwitcherEntries = C.types.map((type) => {
            const info = session.view_info?.[type] || {};
            return { type, icon: info.icon || "oi-view-list", name: info.display_name || type, multiRecord: true };
        });
        return {
            resModel: C.resModel,
            type: this.state.view,
            viewId: this.viewId(this.state.view),
            searchViewId: this.viewId("search"),
            views,
            viewSwitcherEntries,
            displayName: String(this.pageTitle),
            domain: this.domain,
            context: this.context,
            formViewId: this.viewId("form"),
            onSwitchView: (type) => this.setView(type),
            onOpen: (resId) => this.open(resId),
            onCreate: () => this.onNew(),
            noContentHelp: C.emptyTitle ? this.emptyHelp(C.emptyTitle, C.emptyText) : undefined,
        };
    }

    emptyHelp(title, text) {
        const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<p class="o_view_nocontent_smiling_face">${esc(title)}</p><p>${esc(text)}</p>`;
    }
    setView(view) {
        this.state.view = view;
        storeView(this.storageKey, view);
    }
    refresh() {
        this.state.version++;
    }
}

// --------------------------------------------------------------------------- pages

const PICKING_VIEWS = ["list", "kanban", "calendar", "activity"];

/** Receipts, deliveries and internal transfers: Odoo's own transfer views, one type each. */
class TransferPage extends ListPage {
    static resModel = "stock.picking";
    static types = PICKING_VIEWS;
    static code = "";
    get domain() {
        const wh = this.ctx.modern_inventory_warehouse_id;
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
actions.add("modern_inventory.receipts", ReceiptsPage);
actions.add("modern_inventory.deliveries", DeliveriesPage);
actions.add("modern_inventory.internal", InternalPage);
actions.add("modern_inventory.products", ProductsPage);
actions.add("modern_inventory.stock", StockPage);
actions.add("modern_inventory.moves", MovesPage);
