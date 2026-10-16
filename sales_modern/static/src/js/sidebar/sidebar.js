import { Component, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { routerBus } from "@web/core/browser/router";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useBus, useService } from "@web/core/utils/hooks";

/**
 * Sales Modern left sidebar, shown inside Odoo's Sales app.
 *
 * Upgrade-safe by design: a standalone main component that only uses the public
 * `menu`, `ui` and `action` services (no NavBar template override); the app's
 * top-bar section menus are hidden with CSS (sidebar.scss).
 *
 * It shows the whole Sales app menu, nothing hidden:
 *  - Sales Modern' own pages (Dashboard, Sell, Catalog);
 *  - Odoo's Orders / To Invoice / Products menus merged into Sell and Catalog, minus the
 *    entries Sales Modern already shows with its own page (same records, modern page);
 *  - every other Sales menu as its own group, exactly as Odoo names it (Reporting,
 *    Configuration with its sub-sections...), including menus other apps add to Sales
 *    (Inventory's deliveries, Quotation Templates, eCommerce, Subscriptions...).
 * Menus follow Odoo's groups and settings: if Odoo hides a menu, so does the sidebar.
 */
const APP_XMLID = "sale.sale_menu_root";
const OWN_PREFIXES = ["sales_modern."];
// Odoo top-level groups whose remaining entries go into one of our groups
const MERGE_INTO = {
    "sale.sale_order_menu": "sales_modern.menu_sell",
    "sale.menu_sale_invoicing": "sales_modern.menu_sell",
    "sale.product_menu_catalog": "sales_modern.menu_catalog",
};
// Groups shown as dropdowns in the top bar instead of the sidebar, so the sidebar
// only lists the everyday pages. Groups other apps add are top-bar dropdowns too.
const TOP_GROUPS = new Set(["sales_modern.menu_team", "sale.menu_sale_report", "sale.menu_sale_config"]);
const TOP_ICONS = { reporting: "fa-bar-chart", config: "fa-cog", team: "fa-users" };
// Odoo entries replaced by a Sales Modern page on the same records
const REPLACED = new Set([
    "sale.menu_sale_quotations",
    "sale.menu_sale_order",
    "sale.res_partner_menu",
    "sale.menu_sale_order_invoice",
    "sale.menu_product_template_action",
    "sale.report_sales_team",
    "sale.sales_team_config",
]);
const COLLAPSE_KEY = "sales_modern.sidebar.collapsed";

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("sales_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "sales_modern.menu_dashboard": "fa-th-large",
    "sales_modern.menu_quotations": "fa-file-text-o",
    "sales_modern.menu_orders": "fa-shopping-cart",
    "sales_modern.menu_to_invoice": "fa-file-text",
    "sales_modern.menu_customers": "fa-address-book-o",
    "sales_modern.menu_products": "fa-cube",
    "sales_modern.menu_salespeople": "fa-user",
    "sales_modern.menu_pricelists": "fa-tags",
    "sales_modern.menu_teams": "fa-users",
    "sales_modern.menu_settings": "fa-cog",
    "sales_modern.menu_categories": "fa-sitemap",
    "sales_modern.menu_order_tags": "fa-tag",
    // Odoo's own Sales menus
    "sale.menu_sale_quotations": "fa-file-text-o",
    "sale.menu_sale_order": "fa-shopping-cart",
    "sale.report_sales_team": "fa-users",
    "sale.res_partner_menu": "fa-address-book-o",
    "sale.menu_sale_order_invoice": "fa-file-text",
    "sale.menu_sale_order_upselling": "fa-level-up",
    "sale.menu_product_template_action": "fa-cube",
    "sale.menu_products": "fa-cubes",
    "sale.menu_product_pricelist_main": "fa-tags",
    "sale.menu_reporting_sales": "fa-bar-chart",
    "sale.menu_reporting_salespeople": "fa-user",
    "sale.menu_reporting_product": "fa-cube",
    "sale.menu_reporting_customer": "fa-address-book-o",
    "sale.menu_sale_general_settings": "fa-cog",
    "sale.sales_team_config": "fa-users",
    "sale.menu_tag_config": "fa-tag",
    "sale.menu_product_attribute_action": "fa-sliders",
    "sale.menu_product_combos": "fa-th-list",
    "sale.menu_product_categories": "fa-sitemap",
    "sale.menu_product_tags": "fa-tags",
    "sale.menu_product_uom_form_action": "fa-balance-scale",
    "sale.payment_provider_menu": "fa-credit-card",
    "sale.payment_method_menu": "fa-money",
    "sale.sale_menu_config_activity_type": "fa-th",
    "sale.sale_menu_config_activity_plan": "fa-tasks",
    "sale_management.sale_order_template_menu": "fa-clone",
    "sale_pdf_quote_builder.sale_menu_quotation_document_action": "fa-file-pdf-o",
    "sale.menu_sale_order_upselling": "fa-level-up",
    "sale.report_sales_team": "fa-users",
    "sale.payment_token_menu": "fa-key",
    "sale.payment_transaction_menu": "fa-exchange",
})) {
    menuIcons.add(xmlid, icon);
}

export class SalesModernSidebar extends Component {
    static template = "sales_modern.Sidebar";
    static components = { Dropdown, DropdownItem };
    static props = {};

    setup() {
        this.menu = useService("menu");
        this.ui = useState(useService("ui"));
        let collapsed = false;
        try {
            collapsed = browser.localStorage.getItem(COLLAPSE_KEY) === "1";
        } catch {
            // storage unavailable: keep the default
        }
        this.state = useState({ rev: 0, menuId: false, closed: {}, collapsed });
        this.ssUser = { id: user.userId, name: user.name, login: user.login };
        const refresh = () => this.state.rev++;
        useBus(this.env.bus, "MENUS:APP-CHANGED", refresh);
        useBus(this.env.bus, "ACTION_MANAGER:UPDATE", refresh);
        useBus(routerBus, "ROUTE_CHANGE", () => {
            this.state.menuId = false;
            refresh();
        });
    }

    get app() {
        this.state.rev; // re-evaluate on navigation / app change
        const app = this.menu.getCurrentApp?.();
        return app && app.xmlid === APP_XMLID ? app : null;
    }
    get allSections() {
        const app = this.app;
        if (!app) {
            return [];
        }
        const top = this.menu.getMenuAsTree(app.id).childrenTree || [];
        const isOwn = (m) => OWN_PREFIXES.some((p) => (m.xmlid || "").startsWith(p));
        const own = top.filter(isOwn).map((m) => ({ ...m, own: true, childrenTree: [...(m.childrenTree || [])] }));
        const byXmlid = Object.fromEntries(own.map((m) => [m.xmlid, m]));
        const odoo = [];
        for (const menu of top.filter((m) => !isOwn(m))) {
            const target = byXmlid[MERGE_INTO[menu.xmlid]];
            const entries = this.entries(menu).filter((e) => e.heading || !REPLACED.has(e.xmlid));
            if (target) {
                target.childrenTree.push(...entries.filter((e) => !e.heading));
            } else if (entries.some((e) => !e.heading)) {
                // a leaf menu directly under Sales becomes a one-item group
                odoo.push(menu.childrenTree?.length ? { ...menu, childrenTree: entries } : { ...menu, childrenTree: [menu] });
            }
        }
        return [...own, ...odoo];
    }
    /**
     * Entries of an Odoo group for the sidebar: leaves (menus with an action), and a
     * small heading before each nested sub-group (e.g. Configuration ▸ Products).
     */
    entries(menu, depth = 0) {
        const children = menu.childrenTree || [];
        if (!children.length) {
            return menu.actionID || menu.actionPath ? [menu] : [];
        }
        const result = [];
        for (const child of children) {
            if (child.childrenTree?.length) {
                const sub = this.entries(child, depth + 1);
                if (sub.some((e) => !e.heading)) {
                    result.push({ id: `h_${child.id}`, name: child.name, heading: true }, ...sub);
                }
            } else if (child.actionID || child.actionPath) {
                result.push(child);
            }
        }
        return result;
    }
    /** Sidebar: the everyday pages. */
    get sections() {
        return this.allSections.filter((s) => !this.isTop(s));
    }
    /** Top bar: Reporting, Configuration and other apps' groups, as dropdowns. */
    get topSections() {
        return this.allSections.filter((s) => this.isTop(s) && s.childrenTree.some((c) => !c.heading));
    }
    isTop(section) {
        return TOP_GROUPS.has(section.xmlid) || !section.own;
    }
    topIcon(section) {
        const xmlid = section.xmlid || "";
        const key = /report/i.test(xmlid) ? "reporting" : /config/i.test(xmlid) ? "config" : /team/i.test(xmlid) ? "team" : "";
        return TOP_ICONS[key] || "fa-th-large";
    }
    isSectionActive(section) {
        return section.childrenTree.some((c) => !c.heading && this.isActive(c));
    }
    get brand() {
        return this.app?.name || _t("Sales");
    }
    get visible() {
        return Boolean(this.app && !this.ui.isSmall && this.sections.length);
    }

    icon(item) {
        return menuIcons.get(item.xmlid, "fa-circle-o");
    }
    href(item) {
        return `/odoo/${item.actionPath || "action-" + item.actionID}`;
    }
    open(item) {
        this.state.menuId = item.id;
        this.menu.selectMenu(item);
    }
    isGroupOpen(section) {
        if (this.state.collapsed) {
            return true;
        }
        const closed = this.state.closed[section.id];
        if (closed === undefined) {
            // a closed-by-default group opens by itself when the current page is in it
            return !section.closedByDefault || section.childrenTree.some((c) => this.isActive(c));
        }
        return !closed;
    }
    toggleGroup(section) {
        this.state.closed[section.id] = this.isGroupOpen(section);
    }
    toggleCollapse() {
        this.state.collapsed = !this.state.collapsed;
        try {
            browser.localStorage.setItem(COLLAPSE_KEY, this.state.collapsed ? "1" : "0");
        } catch {
            // ignore
        }
    }
    isActive(item) {
        this.state.rev;
        if (!item || (!item.actionID && !item.actionPath)) {
            return false;
        }
        if (this.state.menuId) {
            return item.id === this.state.menuId;
        }
        const path = browser.location.pathname.replace(/\/$/, "");
        const href = this.href(item);
        return path === href || path.startsWith(`${href}/`);
    }
}

registry.category("main_components").add("sales_modern.Sidebar", { Component: SalesModernSidebar });
