import { registry } from "@web/core/registry";
import { SaleOrdersPage, SaleQuotationsPage } from "@modern_theme/js/app_kit/sale_pages";
import { menuIcons } from "../sidebar/sidebar";

menuIcons.add("crm_modern.menu_quotations", "fa-file-text-o");
menuIcons.add("crm_modern.menu_sale_orders", "fa-shopping-cart");

/**
 * Quotations / Sales Orders inside Modern CRM: the same pages as Sales Modern
 * (modern_theme/js/app_kit/sale_pages.js), in the CRM page look. Records open in
 * Odoo's own quotation form. The menus are hidden until Sales is installed.
 */
class QuotationsPage extends SaleQuotationsPage {
    static cssPrefix = "cm";
    static storagePrefix = "crm_modern";
}

class SaleOrdersPage_ extends SaleOrdersPage {
    static cssPrefix = "cm";
    static storagePrefix = "crm_modern";
    static viewKey = "crm_modern.view.order.list";
}

registry.category("actions").add("crm_modern.quotations", QuotationsPage);
registry.category("actions").add("crm_modern.sale_orders", SaleOrdersPage_);
