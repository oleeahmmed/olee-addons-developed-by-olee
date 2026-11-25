import { _t } from "@web/core/l10n/translation";
import { ListPage } from "./list_page";

/**
 * The one Quotations page and the one Sales Orders page.
 *
 * Sales Modern and Modern CRM both list sale.order: they subclass these pages and
 * only set their class prefix (cssPrefix) and storage key. Records always open in
 * Odoo's own quotation form (modern_theme/models/shared_views.py), so add, view and
 * edit look the same from every app.
 */
const ORDER_VIEWS = ["list", "kanban", "calendar", "pivot", "graph", "activity"];
export const SHARED_VIEW_IDS = { model: "res.users", method: "modern_theme_shared_view_ids" };

/** Opened from a sales-team card: only that team's records, and new ones belong to it. */
function teamId(ctx) {
    return Number(ctx.sales_modern_team_id || ctx.modern_team_id || 0);
}

class SaleOrderPage extends ListPage {
    static resModel = "sale.order";
    static types = ORDER_VIEWS;
    static viewIds = SHARED_VIEW_IDS;
    static states = [];

    get domain() {
        const team = teamId(this.ctx);
        return [["state", "in", this.constructor.states], ...(team ? [["team_id", "=", team]] : [])];
    }
    get context() {
        const team = teamId(this.ctx);
        return team ? { default_team_id: team } : {};
    }
}

export class SaleQuotationsPage extends SaleOrderPage {
    static title = _t("Quotations");
    static subtitle = _t("Offers waiting for the customer — send, follow up, confirm");
    static icon = "fa-file-text-o";
    static newLabel = _t("New quotation");
    static emptyTitle = _t("No open quotation");
    static emptyText = _t("Create one in a few seconds: pick the customer, add products, send it.");
    static prefix = "quotation";
    static states = ["draft", "sent"];
}

export class SaleOrdersPage extends SaleOrderPage {
    static title = _t("Sales Orders");
    static subtitle = _t("Confirmed orders — deliver, invoice and follow payment");
    static icon = "fa-shopping-cart";
    static newLabel = _t("New order");
    static emptyTitle = _t("No sales order yet");
    static emptyText = _t("Confirmed quotations become sales orders and show up here.");
    static prefix = "order";
    static states = ["sale"];
}
