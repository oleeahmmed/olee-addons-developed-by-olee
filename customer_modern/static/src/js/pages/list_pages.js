import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ListPage as KitListPage, loadViewIds as kitLoadViewIds, openFullForm } from "@modern_theme/js/app_kit/list_page";

export { openFullForm };

const VIEW_IDS = { model: "res.partner", method: "customer_modern_view_ids" };
/** View ids of this app's pages (fetched once per page load). */
export function loadViewIds(orm) {
    return kitLoadViewIds(orm, VIEW_IDS);
}

/**
 * Pages of Modern Contacts: Odoo's own contact views (search, filters, group by,
 * pager, export, view switcher) in the shared modern page of modern_theme.
 * Adding, viewing and editing use Odoo's own contact form.
 */
export class ListPage extends KitListPage {
    static cssPrefix = "cu";
    static storagePrefix = "customer_modern";
    static viewIds = VIEW_IDS;
    static resModel = "res.partner";
    static types = ["kanban", "list", "activity"];
}

class ContactsPage extends ListPage {
    static title = _t("All Contacts");
    static emptyTitle = _t("Create a contact in your address book");
    static emptyText = _t("Customers, vendors, colleagues: everyone you work with, in one place.");
    static icon = "fa-address-card-o";
    static newLabel = _t("New contact");
    static prefix = "contact";
    get context() {
        return { default_is_company: true }; // as Odoo's Contacts menu
    }
}

class CompaniesPage extends ListPage {
    static title = _t("Companies");
    static emptyTitle = _t("No company yet");
    static emptyText = _t("Add the businesses you work with; their people are added inside them.");
    static icon = "fa-building-o";
    static newLabel = _t("New company");
    static prefix = "company";
    get domain() {
        return [["is_company", "=", true]];
    }
    get context() {
        return { default_is_company: true };
    }
}

class PeoplePage extends ListPage {
    static title = _t("People");
    static emptyTitle = _t("No person yet");
    static emptyText = _t("Individuals, on their own or working for one of your companies.");
    static icon = "fa-user-o";
    static newLabel = _t("New person");
    static prefix = "person";
    get domain() {
        return [["is_company", "=", false]];
    }
    get context() {
        return { default_is_company: false };
    }
}

class CustomersPage extends ListPage {
    static title = _t("Customers");
    static emptyTitle = _t("No customer yet");
    static emptyText = _t("A contact becomes a customer with its first invoice or sales order.");
    static icon = "fa-handshake-o";
    static newLabel = _t("New customer");
    static prefix = "customer";
    get domain() {
        return [["customer_rank", ">", 0]];
    }
    get context() {
        // Odoo's own customer mode: sorted by customer rank, new ones are customers
        return { res_partner_search_mode: "customer", default_is_company: true, default_customer_rank: 1 };
    }
}

class VendorsPage extends ListPage {
    static title = _t("Vendors");
    static emptyTitle = _t("No vendor yet");
    static emptyText = _t("A contact becomes a vendor with its first bill or purchase order.");
    static icon = "fa-truck";
    static newLabel = _t("New vendor");
    static prefix = "vendor";
    get domain() {
        return [["supplier_rank", ">", 0]];
    }
    get context() {
        return { res_partner_search_mode: "supplier", default_is_company: true, default_supplier_rank: 1 };
    }
}

const actions = registry.category("actions");
actions.add("customer_modern.contacts", ContactsPage);
actions.add("customer_modern.companies", CompaniesPage);
actions.add("customer_modern.people", PeoplePage);
actions.add("customer_modern.customers", CustomersPage);
actions.add("customer_modern.vendors", VendorsPage);
