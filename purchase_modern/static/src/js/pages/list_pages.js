import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { NativeView } from "../components/native_view";
let viewIdsPromise = null;
/** View ids are the same for every page and every user: fetch them once per page load. */
export function loadViewIds(orm) {
    viewIdsPromise ||= orm.call("purchase.order", "purchase_modern_view_ids", []).catch((e) => {
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
    static template = "purchase_modern.ListPage";
    static components = { NativeView };
    static props = ["*"];

    static title = "";
    static subtitle = "";
    static icon = "";
    static newLabel = _t("New");
    static resModel = "";
    static types = ["list"];
    static prefix = ""; // key prefix in purchase_modern_view_ids, e.g. "order" → order_list
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
        this.storageKey = `purchase_modern.view.${C.prefix || C.resModel}`;
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
    static types = ["kanban", "list", "pivot", "graph", "activity"];
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
