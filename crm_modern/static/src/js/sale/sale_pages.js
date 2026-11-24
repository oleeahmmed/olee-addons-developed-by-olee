import { markup } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ListPage } from "../pages/list_pages";
import { menuIcons } from "../sidebar/sidebar";

menuIcons.add("crm_modern.menu_quotations", "fa-file-text-o");
menuIcons.add("crm_modern.menu_sale_orders", "fa-shopping-cart");

/** Same empty-list help as Sales Modern (both pages show Odoo's own views). */
function emptyHelp(title, text) {
    return markup(`<p class="o_view_nocontent_smiling_face">${title}</p><p>${text}</p>`);
}

/**
 * Quotations / Sales Orders in the Modern CRM list design. Records open in the
 * full Sales form (send, confirm, invoice, print… all of Odoo's own buttons).
 */
class SaleOrderPage extends ListPage {
    static resModel = "sale.order";
    static types = ["list", "kanban", "calendar", "pivot", "graph", "activity"];
    static requiresFeature = "sale";
    static unavailableTitle = _t("Sales is not installed");
    static unavailableDescription = _t("Quotations and sales orders from CRM appear here when the Sales app is installed.");

    openSaleForm(resId) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "sale.order",
            res_id: resId || false,
            views: [[this.viewId("form"), "form"]],
            target: "current",
            context: this.context,
        });
    }
    open(resId) {
        return this.openSaleForm(resId);
    }
    create() {
        return this.openSaleForm(false);
    }
}

class QuotationsPage extends SaleOrderPage {
    static title = _t("Quotations");
    static subtitle = _t("Offers waiting for the customer — send, follow up, confirm");
    static icon = "fa-file-text-o";
    static newLabel = _t("New quotation");
    static prefix = "quotation";
    static get noContentHelp() {
        return emptyHelp(
            _t("No open quotation"),
            _t("Create one in a few seconds: pick the customer, add products, send it.")
        );
    }
    get domain() {
        return [["state", "in", ["draft", "sent"]]];
    }
}

class SaleOrdersPage extends SaleOrderPage {
    static title = _t("Sales Orders");
    static subtitle = _t("Confirmed orders — deliver, invoice and follow payment");
    static icon = "fa-shopping-cart";
    static newLabel = _t("New order");
    static prefix = "order";
    static get noContentHelp() {
        return emptyHelp(
            _t("No sales order yet"),
            _t("Confirmed quotations become sales orders and show up here.")
        );
    }
    // Fresh key so an old remembered kanban does not override the list default.
    static viewKey = "crm_modern.view.order.list";
    get domain() {
        return [["state", "=", "sale"]];
    }
}

registry.category("actions").add("crm_modern.quotations", QuotationsPage);
registry.category("actions").add("crm_modern.sale_orders", SaleOrdersPage);
