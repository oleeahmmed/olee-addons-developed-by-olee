import { Component, onWillStart, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { routerBus } from "@web/core/browser/router";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { user } from "@web/core/user";
import { useBus, useService } from "@web/core/utils/hooks";

/**
 * Modern Purchase left sidebar, shown inside Odoo's Purchase app.
 *
 * Upgrade-safe by design: a standalone main component that only uses the public
 * `menu`, `ui` and `action` services (no NavBar template override); the app's
 * top-bar section menus are hidden with CSS (sidebar.scss).
 *
 * It shows the whole Purchase app menu, nothing hidden:
 *  - Modern Purchase's own pages (Dashboard, Buy, Catalog);
 *  - Odoo's Orders / Products menus merged into Buy and Catalog, minus the
 *    entries Modern Purchase already shows with its own page (same records, modern page);
 *  - every other Purchase menu as its own group, exactly as Odoo names it (Reporting,
 *    Configuration with its sub-sections...), including menus other apps add to Purchase.
 * Menus follow Odoo's groups and settings: if Odoo hides a menu, so does the sidebar.
 */
const APP_XMLID = "purchase.menu_purchase_root";
const OWN_PREFIXES = ["purchase_modern."];
// Odoo top-level groups whose remaining entries go into one of our groups
const MERGE_INTO = {
    "purchase.menu_procurement_management": "purchase_modern.menu_buy",
    "purchase.menu_purchase_products": "purchase_modern.menu_catalog",
};
// Groups shown as dropdowns in the top bar instead of the sidebar, so the sidebar
// only lists the everyday pages. Groups other apps add are top-bar dropdowns too.
const TOP_GROUPS = new Set(["purchase.purchase_report_main", "purchase.menu_purchase_config"]);
const TOP_ICONS = { reporting: "fa-bar-chart", config: "fa-cog" };
// Odoo entries replaced by a Modern Purchase page on the same records
const REPLACED = new Set([
    "purchase.menu_purchase_rfq",
    "purchase.menu_purchase_form_action",
    "purchase.menu_procurement_management_supplier_name",
    "purchase.menu_procurement_partner_contact_form",
]);
const COLLAPSE_KEY = "purchase_modern.sidebar.collapsed";

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("purchase_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "purchase_modern.menu_dashboard": "fa-th-large",
    "purchase_modern.menu_rfqs": "fa-file-text-o",
    "purchase_modern.menu_orders": "fa-shopping-cart",
    "purchase_modern.menu_to_bill": "fa-file-text",
    "purchase_modern.menu_vendors": "fa-address-book-o",
    "purchase_modern.menu_products": "fa-cube",
    "purchase_modern.menu_settings": "fa-cog",
    // Odoo's own Purchase menus
    "purchase.menu_purchase_rfq": "fa-file-text-o",
    "purchase.menu_purchase_form_action": "fa-shopping-cart",
    "purchase.menu_procurement_management_supplier_name": "fa-address-book-o",
    "purchase.menu_procurement_partner_contact_form": "fa-cube",
    "purchase.product_product_menu": "fa-cubes",
    "purchase.menu_product_pricelist_action2_purchase": "fa-tags",
    "purchase.menu_product_attribute_action": "fa-sliders",
    "purchase.menu_product_category_config_purchase": "fa-sitemap",
    "purchase.menu_purchase_uom_form_action": "fa-balance-scale",
    "purchase.purchase_report": "fa-bar-chart",
})) {
    menuIcons.add(xmlid, icon);
}

/**
 * What the sidebar's "+" button creates, one entry per page: the model behind
 * the page you are on and the label shown on the button.
 */
export const createTargets = registry.category("purchase_modern.create_targets");
for (const [xmlid, spec] of Object.entries({
    "purchase_modern.menu_rfqs": { resModel: "purchase.order", label: _t("New request for quotation") },
    "purchase_modern.menu_orders": { resModel: "purchase.order", label: _t("New purchase order") },
    "purchase_modern.menu_to_bill": { resModel: "purchase.order", label: _t("New purchase order") },
    "purchase_modern.menu_vendors": { resModel: "res.partner", label: _t("New vendor"), context: { default_supplier_rank: 1 } },
    "purchase_modern.menu_products": { resModel: "product.template", label: _t("New product"), context: { default_purchase_ok: true, default_is_storable: true } },
    "purchase_modern.menu_pricelists": { resModel: "product.supplierinfo", label: _t("New vendor pricelist") },
})) {
    createTargets.add(xmlid, spec);
}
/** Page the "+" falls back to when the current page has nothing to create. */
const DEFAULT_CREATE = "purchase_modern.menu_rfqs";

export class ModernPurchaseSidebar extends Component {
    static template = "purchase_modern.Sidebar";
    static components = { Dropdown, DropdownItem };
    static props = {};

    setup() {
        this.menu = useService("menu");
        this.ui = useState(useService("ui"));
        this.orm = useService("orm");
        this.action = useService("action");
        let collapsed = false;
        try {
            collapsed = browser.localStorage.getItem(COLLAPSE_KEY) === "1";
        } catch {
            // storage unavailable: keep the default
        }
        this.state = useState({ rev: 0, menuId: false, closed: {}, collapsed, rights: {} });
        this.mpUser = { id: user.userId, name: user.name, login: user.login };
        const refresh = () => this.state.rev++;
        useBus(this.env.bus, "MENUS:APP-CHANGED", refresh);
        useBus(this.env.bus, "ACTION_MANAGER:UPDATE", refresh);
        useBus(routerBus, "ROUTE_CHANGE", () => {
            this.state.menuId = false;
            refresh();
        });
        onWillStart(async () => {
            // The "+" button only offers what the user is actually allowed to create.
            const models = [...new Set(createTargets.getEntries().map(([, spec]) => spec.resModel))];
            const allowed = await Promise.all(
                models.map((m) => user.checkAccessRight(m, "create").catch(() => false))
            );
            this.state.rights = Object.fromEntries(models.map((m, i) => [m, allowed[i]]));
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
        return this.app?.name || _t("Purchase");
    }
    get visible() {
        return Boolean(this.app && !this.ui.isSmall && this.sections.length);
    }

    /** The record the "+" button creates: the one of the page you are on. */
    get createSpec() {
        this.state.rev; // re-evaluate on navigation / app change
        for (const section of this.allSections) {
            for (const child of section.childrenTree || []) {
                if (!child.heading && this.isActive(child) && createTargets.contains(child.xmlid)) {
                    return createTargets.get(child.xmlid);
                }
            }
        }
        return createTargets.get(DEFAULT_CREATE, null);
    }
    get createLabel() {
        return this.createSpec?.label || _t("New");
    }
    get canCreate() {
        const model = this.createSpec?.resModel;
        return Boolean(model) && this.state.rights[model] !== false;
    }
    /**
     * "+" button: open Odoo's own form, empty, for the page you are on — so
     * creating is exactly the same screen as viewing and editing.
     */
    async onNew() {
        const spec = this.createSpec;
        if (!spec) {
            return;
        }
        const context = { ...(spec.context || {}) };
        if (spec.pickingTypeCode) {
            // Transfers need an operation type; take the one of the current company.
            const companyId = user.context?.allowed_company_ids?.[0] || session.company_id;
            const types = await this.orm
                .searchRead(
                    "stock.picking.type",
                    [["code", "=", spec.pickingTypeCode], ["company_id", "=", companyId]],
                    ["id"],
                    { limit: 1 }
                )
                .catch(() => []);
            if (types.length) {
                context.default_picking_type_id = types[0].id;
            }
        }
        this.action.doAction({
            type: "ir.actions.act_window",
            name: spec.label,
            res_model: spec.resModel,
            views: [[false, "form"]],
            target: "current",
            context,
        });
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

registry.category("main_components").add("purchase_modern.Sidebar", { Component: ModernPurchaseSidebar });
