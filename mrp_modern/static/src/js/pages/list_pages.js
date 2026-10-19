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
    viewIdsPromise ||= orm.call("mrp.production", "mrp_modern_view_ids", []).catch((e) => {
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
 * One list page = Odoo's own views in the modern shell. Subclasses describe
 * the model, views, domain, context and what "open" / "new" do.
 */
export class ListPage extends Component {
    static template = "mrp_modern.ListPage";
    static components = { NativeView };
    static props = ["*"];

    static title = "";
    static subtitle = "";
    static icon = "";
    static newLabel = _t("New");
    static resModel = "";
    static types = ["list"];
    static prefix = "";
    static allowCreate = true;
    static emptyTitle = "";
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
        this.storageKey = `mrp_modern.view.${C.prefix || C.resModel}`;
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
        return { default_is_storable: true };
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
