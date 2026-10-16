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
 * Inventory Modern left sidebar, shown inside Odoo's Inventory app.
 *
 * Upgrade-safe by design: a standalone main component that only uses the public
 * `menu`, `ui` and `action` services (no NavBar template override); the app's
 * top-bar section menus are hidden with CSS (sidebar.scss).
 *
 * It shows the whole Inventory app menu, nothing hidden:
 *  - Inventory Modern's own pages (Dashboard, Operations, Products);
 *  - Odoo's Overview / Operations (Adjustments, Procurement...) and Products menus merged
 *    into Operations and Products, minus the entries Inventory Modern shows with its own
 *    page (same records, modern page);
 *  - Reporting, Configuration and the menus other apps add to Inventory (Purchase,
 *    Manufacturing, Barcode...) as top-bar dropdowns, exactly as Odoo names them.
 * Menus follow Odoo's groups and settings: if Odoo hides a menu, so does the sidebar.
 */
const APP_XMLID = "stock.menu_stock_root";
const OWN_PREFIXES = ["inventory_modern."];
// Odoo top-level groups whose remaining entries go into one of our groups
const MERGE_INTO = {
    "stock.stock_picking_type_menu": "inventory_modern.menu_operations",
    "stock.menu_stock_warehouse_mgmt": "inventory_modern.menu_operations",
    "stock.menu_stock_inventory_control": "inventory_modern.menu_products",
};
// Groups shown as dropdowns in the top bar instead of the sidebar, so the sidebar
// only lists the everyday pages. Groups other apps add are top-bar dropdowns too.
const TOP_GROUPS = new Set(["stock.menu_warehouse_report", "stock.menu_stock_config_settings"]);
const TOP_ICONS = { reporting: "fa-bar-chart", config: "fa-cog", team: "fa-users" };
// Odoo entries replaced by an Inventory Modern page on the same records
const REPLACED = new Set([
    "stock.in_picking",
    "stock.out_picking",
    "stock.int_picking",
    "stock.menu_product_variant_config_stock",
]);
const COLLAPSE_KEY = "inventory_modern.sidebar.collapsed";

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("inventory_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "inventory_modern.menu_dashboard": "fa-th-large",
    "inventory_modern.menu_receipts": "fa-download",
    "inventory_modern.menu_deliveries": "fa-truck",
    "inventory_modern.menu_internal": "fa-exchange",
    "inventory_modern.menu_product_list": "fa-cube",
    "inventory_modern.menu_stock": "fa-cubes",
    "inventory_modern.menu_moves": "fa-history",
    // Odoo's own Inventory menus
    "stock.stock_picking_type_menu": "fa-th",
    "stock.in_picking": "fa-download",
    "stock.out_picking": "fa-truck",
    "stock.int_picking": "fa-exchange",
    "stock.menu_action_inventory_tree": "fa-check-square-o",
    "stock.menu_stock_scrap": "fa-trash-o",
    "stock.menu_reordering_rules_replenish": "fa-refresh",
    "stock.menu_stock_references": "fa-link",
    "stock.menu_procurement_compute": "fa-play-circle-o",
    "stock.menu_product_variant_config_stock": "fa-cube",
    "stock.product_product_menu": "fa-clone",
    "stock.menu_action_production_lot_form": "fa-barcode",
    "stock.menu_package": "fa-archive",
    "stock.menu_product_stock": "fa-cubes",
    "stock.menu_valuation": "fa-map-marker",
    "stock.stock_move_line_menu": "fa-history",
    "stock.stock_move_menu": "fa-line-chart",
    "stock.menu_stock_general_settings": "fa-cog",
    "stock.menu_action_warehouse_form": "fa-building-o",
    "stock.menu_pickingtype": "fa-th-list",
    "stock.menu_action_location_form": "fa-map-marker",
    "stock.menu_routes_config": "fa-random",
    "stock.menu_action_rules_form": "fa-code-fork",
    "stock.menu_storage_categoty_config": "fa-th-large",
    "stock.menu_putaway": "fa-sign-in",
    "stock.menu_product_category_config_stock": "fa-sitemap",
    "stock.menu_attribute_action": "fa-sliders",
    "stock.menu_stock_uom_form_action": "fa-balance-scale",
    "stock.menu_wms_barcode_nomenclature_all": "fa-barcode",
    "stock.menu_packaging_types": "fa-archive",
})) {
    menuIcons.add(xmlid, icon);
}

export class InventoryModernSidebar extends Component {
    static template = "inventory_modern.Sidebar";
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
                // a leaf menu directly under Inventory becomes a one-item group
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
        return this.app?.name || _t("Inventory");
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

registry.category("main_components").add("inventory_modern.Sidebar", { Component: InventoryModernSidebar });
