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
    viewIdsPromise ||= orm.call("sale.order", "sales_modern_view_ids", []).catch((e) => {
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
    static template = "sales_modern.ListPage";
    static components = { NativeView };
    static props = ["*"];

    static title = "";
    static subtitle = "";
    static icon = "";
    static newLabel = _t("New");
    static resModel = "";
    static types = ["list"];
    static prefix = ""; // key prefix in sales_modern_view_ids, e.g. "order" → order_list
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
        this.storageKey = C.viewKey || `sales_modern.view.${C.prefix || C.resModel}`;
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
        return [["invoice_status", "=", "to invoice"]];
    }
    get context() {
        return { create: false };
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
    static types = ["kanban", "list", "pivot", "graph", "activity"];
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
    static types = ["kanban", "list", "pivot", "graph"];
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
    static types = ["kanban", "list", "pivot", "graph"];
}

const actions = registry.category("actions");
actions.add("sales_modern.quotations", QuotationsPage);
actions.add("sales_modern.orders", OrdersPage);
actions.add("sales_modern.to_invoice", ToInvoicePage);
actions.add("sales_modern.customers", CustomersPage);
actions.add("sales_modern.products", ProductsPage);
actions.add("sales_modern.teams", TeamsPage);
actions.add("sales_modern.salespeople", SalespeoplePage);
