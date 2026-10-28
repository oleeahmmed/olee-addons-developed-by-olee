import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useBus } from "@web/core/utils/hooks";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";
import { usePinApp } from "./app_context";
import { CategoryDrawer, CustomerDrawer, ProductDrawer, ShopDrawer, openQuickDrawer } from "./drawer";

export { openFullForm };

export const APP_XMLID = "point_of_sale.menu_point_root";
const VIEW_IDS = { model: "pos.order", method: "pos_modern_view_ids" };

/** View ids of this app's pages (fetched once per page load). */
export function loadViewIds(orm) {
    return kitLoadViewIds(orm, VIEW_IDS);
}

function allowedCompanies() {
    return user.context.allowed_company_ids || user.activeCompanies?.map((c) => c.id) || [];
}

/**
 * Pages of Modern POS: Odoo's own Point of Sale views (search, filters, group by, pager,
 * export, view switcher) in the shared modern page of modern_theme, with CRM-style cards.
 * Orders, sessions, products and customers open as Odoo's own full page; simple records
 * (a new product, customer, shop, a PoS category) in the CRM drawer.
 */
export class ListPage extends KitListPage {
    static cssPrefix = "ps";
    static storagePrefix = "pos_modern";
    static viewIds = VIEW_IDS;
    static appXmlid = APP_XMLID;
    /** CRM-style drawer for this page's records (open and new), or null for Odoo's full page. */
    static quickDrawer = null;
    /** Drawer used by "New" only (existing records open as Odoo's full page). */
    static createDrawer = null;

    setup() {
        super.setup();
        usePinApp(this.constructor.appXmlid);
        useBus(this.env.bus, "pos_modern:reload", () => this.refresh());
    }
    drawer(Drawer, resId = false) {
        return openQuickDrawer(this.dialog, Drawer, { resId: resId || false, context: this.context || {} }).then(() =>
            this.refresh()
        );
    }
    open(resId) {
        const C = this.constructor;
        return C.quickDrawer ? this.drawer(C.quickDrawer, resId) : super.open(resId);
    }
    create() {
        const C = this.constructor;
        const Drawer = C.quickDrawer || C.createDrawer;
        return Drawer ? this.drawer(Drawer, false) : super.create();
    }
}

// ------------------------------------------------------------------ shops
class ShopsPage extends ListPage {
    static title = _t("Shops");
    static resModel = "pos.config";
    static prefix = "shop";
    static types = ["kanban", "list"];
    static icon = "fa-shopping-basket";
    static newLabel = _t("New shop");
    static createDrawer = ShopDrawer;
    static emptyTitle = _t("Create your first shop");
    static emptyText = _t("A shop is a register: open it to start selling, close it at the end of the day.");
    get domain() {
        return [["company_id", "in", allowedCompanies()]];
    }
    open(resId) {
        // list rows: Odoo's own shop settings
        return openFullForm(this.action, "pos.config", resId, { viewId: this.viewId("form") });
    }
}

// ------------------------------------------------------------------ orders
class OrderPage extends ListPage {
    static resModel = "pos.order";
    static icon = "fa-shopping-cart";
    static allowCreate = false;
    static types = ["list", "kanban", "pivot", "graph"];
    get domain() {
        return [["company_id", "in", allowedCompanies()]];
    }
}

class OrdersPage extends OrderPage {
    static title = _t("Orders");
    static prefix = "order";
    static emptyTitle = _t("No order yet");
    static emptyText = _t("Orders are made at the register. Open a shop and start selling.");
}

class RefundsPage extends OrderPage {
    static title = _t("Refunds");
    static prefix = "refund";
    static emptyTitle = _t("No refund");
    static emptyText = _t("Orders refunded at the register (negative amounts) show up here.");
    get domain() {
        return [...super.domain, ["amount_total", "<", 0]];
    }
}

class OngoingPage extends OrderPage {
    static title = _t("Ongoing Orders");
    static prefix = "ongoing";
    static types = ["list", "kanban"];
    static emptyTitle = _t("No ongoing order");
    static emptyText = _t("Orders started at the register and not paid yet show up here.");
    get domain() {
        return [...super.domain, ["state", "=", "draft"]];
    }
}

// ------------------------------------------------------------------ sessions & payments
class SessionsPage extends ListPage {
    static title = _t("Sessions");
    static resModel = "pos.session";
    static prefix = "session";
    static types = ["list", "kanban"];
    static icon = "fa-clock-o";
    static allowCreate = false;
    static emptyTitle = _t("No session yet");
    static emptyText = _t("A session starts when a register is opened and ends when it is closed.");
    get domain() {
        return [["config_id.company_id", "in", allowedCompanies()]];
    }
}

class PaymentsPage extends ListPage {
    static title = _t("Payments");
    static resModel = "pos.payment";
    static prefix = "payment";
    static types = ["list"];
    static icon = "fa-credit-card";
    static allowCreate = false;
    static emptyTitle = _t("No payment yet");
    static emptyText = _t("Every payment taken at the register, by method: cash, card, customer account…");
    get context() {
        return { search_default_group_by_payment_method: 1 };
    }
}

// ------------------------------------------------------------------ catalog & customers
class ProductsPage extends ListPage {
    static title = _t("Products");
    static resModel = "product.template";
    static prefix = "product";
    static types = ["kanban", "list"];
    static icon = "fa-cube";
    static newLabel = _t("New product");
    static createDrawer = ProductDrawer;
    static emptyTitle = _t("Add your first product");
    static emptyText = _t("Products available in the Point of Sale are the ones the cashier can sell.");
    get domain() {
        return [["available_in_pos", "=", true]];
    }
    get context() {
        return { default_available_in_pos: true, create_variant_never: "no_variant" };
    }
}

class CustomersPage extends ListPage {
    static title = _t("Customers");
    static resModel = "res.partner";
    static prefix = "customer";
    static types = ["kanban", "list"];
    static icon = "fa-address-book-o";
    static newLabel = _t("New customer");
    static createDrawer = CustomerDrawer;
    static emptyTitle = _t("Add your first customer");
    static emptyText = _t("Customers can be picked at the register, for invoices, loyalty and their history.");
    get context() {
        return { search_default_customer: 1, res_partner_search_mode: "customer", default_customer_rank: 1 };
    }
}

class CategoriesPage extends ListPage {
    static title = _t("PoS Product Categories");
    static resModel = "pos.category";
    static prefix = "category";
    static types = ["list", "kanban"];
    static icon = "fa-th-large";
    static newLabel = _t("New category");
    static quickDrawer = CategoryDrawer;
    static emptyTitle = _t("Create a category");
    static emptyText = _t("Categories are the tabs of the register's product screen: Drinks, Food, Desserts…");
}

const actions = registry.category("actions");
actions.add("pos_modern.shops", ShopsPage);
actions.add("pos_modern.orders", OrdersPage);
actions.add("pos_modern.refunds", RefundsPage);
actions.add("pos_modern.ongoing", OngoingPage);
actions.add("pos_modern.sessions", SessionsPage);
actions.add("pos_modern.payments", PaymentsPage);
actions.add("pos_modern.products", ProductsPage);
actions.add("pos_modern.customers", CustomersPage);
actions.add("pos_modern.categories", CategoriesPage);
