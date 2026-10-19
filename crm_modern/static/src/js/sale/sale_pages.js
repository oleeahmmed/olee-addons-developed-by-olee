import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ListPage } from "../pages/list_pages";
import { menuIcons } from "../sidebar/sidebar";

menuIcons.add("crm_modern.menu_quotations", "fa-file-text-o");
menuIcons.add("crm_modern.menu_sale_orders", "fa-shopping-cart");

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
    static subtitle = _t("Quotes waiting for the customer — send, follow up, confirm");
    static icon = "fa-file-text-o";
    static newLabel = _t("New quotation");
    static prefix = "quotation";
    get domain() {
        return [["state", "in", ["draft", "sent"]]];
    }
}

class SaleOrdersPage extends SaleOrderPage {
    static title = _t("Sales Orders");
    static subtitle = _t("Confirmed orders, ready to deliver and invoice");
    static icon = "fa-shopping-cart";
    static newLabel = _t("New order");
    static prefix = "order";
    get domain() {
        return [["state", "=", "sale"]];
    }
}

registry.category("actions").add("crm_modern.quotations", QuotationsPage);
registry.category("actions").add("crm_modern.sale_orders", SaleOrdersPage);
