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
 * Manufacturing Modern left sidebar, shown inside Odoo's Manufacturing app.
 *
 * Same layout as CRM / Sales Modern: a standalone main component (public `menu`,
 * `ui` and `action` services; no NavBar template override). Odoo's top-bar
 * section menus are hidden with CSS; we draw our own.
 *
 * Sidebar = everyday pages only (Home, Dashboard, Operations, Products).
 * Top bar = Reporting, Configuration, and anything other apps add to MRP.
 * Leftover Odoo menus (Scrap, Lots, Planning…) go into those top-bar groups,
 * never into the sidebar. Odoo's groups still decide what each user sees.
 */
const APP_XMLID = "mrp.menu_mrp_root";
const OWN_PREFIXES = ["mrp_modern."];
// Leftover Odoo entries go into our top-bar groups, not the sidebar.
const MERGE_INTO = {
    "mrp.menu_mrp_manufacturing": "mrp_modern.menu_config",
    "mrp.menu_mrp_bom": "mrp_modern.menu_config",
    "mrp.mrp_planning_menu_root": "mrp_modern.menu_config",
    "mrp.menu_mrp_reporting": "mrp_modern.menu_reporting",
    "mrp.menu_mrp_configuration": "mrp_modern.menu_config",
};
// Groups shown as dropdowns in the top bar instead of the sidebar.
const TOP_GROUPS = new Set(["mrp_modern.menu_reporting", "mrp_modern.menu_config"]);
const TOP_ICONS = { reporting: "fa-bar-chart", config: "fa-cog", planning: "fa-calendar" };
// Odoo entries replaced by a Manufacturing Modern page / menu on the same records
const REPLACED = new Set([
    "mrp.menu_mrp_production_action",
    "mrp.menu_mrp_unbuild",
    "mrp.menu_mrp_workorder_todo",
    "mrp.menu_mrp_bom_form_action",
    "mrp.menu_mrp_product_form",
    "mrp.menu_view_resource_search_mrp",
    "mrp.menu_mrp_work_order_report",
    "mrp.menu_mrp_workcenter_productivity_report",
    "mrp.menu_mrp_config",
    "mrp.menu_mrp_routing_action",
]);
const COLLAPSE_KEY = "mrp_modern.sidebar.collapsed";

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("mrp_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "mrp_modern.menu_home": "fa-home",
    "mrp_modern.menu_dashboard": "fa-th-large",
    "mrp_modern.menu_todo": "fa-list",
    "mrp_modern.menu_mos": "fa-industry",
    "mrp_modern.menu_done": "fa-check-circle",
    "mrp_modern.menu_unbuild": "fa-undo",
    "mrp_modern.menu_workorders": "fa-cogs",
    "mrp_modern.menu_product_list": "fa-cube",
    "mrp_modern.menu_boms": "fa-sitemap",
    "mrp_modern.menu_workcenters": "fa-wrench",
    "mrp_modern.menu_settings": "fa-cog",
    "mrp_modern.menu_operations_setup": "fa-list-ol",
    "mrp_modern.menu_report_workorders": "fa-bar-chart",
    "mrp_modern.menu_report_oee": "fa-line-chart",
    "mrp.menu_mrp_production_action": "fa-industry",
    "mrp.menu_mrp_unbuild": "fa-undo",
    "mrp.menu_mrp_workorder_todo": "fa-cogs",
    "mrp.menu_mrp_bom_form_action": "fa-sitemap",
    "mrp.menu_mrp_product_form": "fa-cube",
    "mrp.menu_view_resource_search_mrp": "fa-wrench",
    "mrp.menu_mrp_scrap": "fa-trash-o",
    "mrp.menu_mrp_traceability": "fa-exchange",
    "mrp.menu_mrp_work_order_report": "fa-bar-chart",
})) {
    menuIcons.add(xmlid, icon);
}

/**
 * What the sidebar's "+" button creates, one entry per page: the model behind
 * the page you are on and the label shown on the button.
 */
export const createTargets = registry.category("mrp_modern.create_targets");
for (const [xmlid, spec] of Object.entries({
    "mrp_modern.menu_todo": { resModel: "mrp.production", label: _t("New manufacturing order") },
    "mrp_modern.menu_mos": { resModel: "mrp.production", label: _t("New manufacturing order") },
    "mrp_modern.menu_done": { resModel: "mrp.production", label: _t("New manufacturing order") },
    "mrp_modern.menu_unbuild": { resModel: "mrp.unbuild", label: _t("New unbuild order") },
    "mrp_modern.menu_workorders": { resModel: "mrp.workorder", label: _t("New work order") },
    "mrp_modern.menu_boms": { resModel: "mrp.bom", label: _t("New bill of materials") },
    "mrp_modern.menu_workcenters": { resModel: "mrp.workcenter", label: _t("New work center") },
    "mrp_modern.menu_product_list": { resModel: "product.template", label: _t("New product"), context: { default_is_storable: true } },
})) {
    createTargets.add(xmlid, spec);
}
/** Page the "+" falls back to when the current page has nothing to create. */
const DEFAULT_CREATE = "mrp_modern.menu_todo";
/** Models a page shows but that are not created on their own (e.g. activities need a record). */
const NO_CREATE = new Set(["mail.activity"]);

export class MrpModernSidebar extends Component {
    static template = "mrp_modern.Sidebar";
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
        this.mrUser = { id: user.userId, name: user.name, login: user.login };
        const refresh = () => this.state.rev++;
        useBus(this.env.bus, "MENUS:APP-CHANGED", refresh);
        useBus(this.env.bus, "ACTION_MANAGER:UPDATE", refresh);
        // the current controller is only switched once the new page is mounted
        useBus(this.env.bus, "ACTION_MANAGER:UI-UPDATED", () => {
            refresh();
            this.checkActionRights();
        });
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
                target.childrenTree.push(...entries);
            } else if (entries.some((e) => !e.heading)) {
                odoo.push(menu.childrenTree?.length ? { ...menu, childrenTree: entries } : { ...menu, childrenTree: [menu] });
            }
        }
        for (const section of [...own, ...odoo]) {
            section.childrenTree = section.childrenTree.filter(
                (e, i, all) => !e.heading || (all[i + 1] && !all[i + 1].heading)
            );
        }
        return [...own, ...odoo].filter((s) => s.childrenTree.length || s.actionID || s.actionPath);
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
        const key = /report/i.test(xmlid) ? "reporting" : /config/i.test(xmlid) ? "config" : /plan/i.test(xmlid) ? "planning" : /team/i.test(xmlid) ? "team" : "";
        return TOP_ICONS[key] || "fa-th-large";
    }
    isSectionActive(section) {
        return section.childrenTree.some((c) => !c.heading && this.isActive(c));
    }
    get brand() {
        return this.app?.name || _t("Manufacturing");
    }
    get visible() {
        return Boolean(this.app && !this.ui.isSmall && this.sections.length);
    }

    /** The record the "+" button creates: the one of the page you are on. */
    get pageCreateSpec() {
        this.state.rev; // re-evaluate on navigation / app change
        for (const section of this.allSections) {
            for (const child of section.childrenTree || []) {
                if (!child.heading && this.isActive(child) && createTargets.contains(child.xmlid)) {
                    return createTargets.get(child.xmlid);
                }
            }
        }
        return null;
    }
    /** Pages without their own entry (Configuration...): create the record the page shows. */
    get actionCreateSpec() {
        this.state.rev; // re-evaluate on navigation / app change
        const action = this.action.currentController?.action;
        const model = action?.res_model;
        const context = action?.context || {};
        if (!model || NO_CREATE.has(model) || context.create === false) {
            return null;
        }
        const known = createTargets.getAll().find((spec) => spec.resModel === model);
        if (known) {
            return known;
        }
        const defaults = Object.entries(context).filter(([key]) => key.startsWith("default_"));
        return { resModel: model, label: _t("New"), context: Object.fromEntries(defaults) };
    }
    checkActionRights() {
        const model = this.action.currentController?.action?.res_model;
        if (model && !(model in this.state.rights)) {
            user.checkAccessRight(model, "create")
                .catch(() => false)
                .then((allowed) => (this.state.rights[model] = allowed));
        }
    }
    get tagCreateSpec() {
        const tag = this.action.currentController?.action?.tag;
        if (!tag) {
            return null;
        }
        for (const [xmlid, spec] of createTargets.getEntries()) {
            if (spec.tag === tag || xmlid.replace(".menu_", ".") === tag) {
                return spec;
            }
        }
        return null;
    }
    get createSpec() {
        return this.pageCreateSpec || this.tagCreateSpec || this.actionCreateSpec || createTargets.get(DEFAULT_CREATE, null);
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

registry.category("main_components").add("mrp_modern.Sidebar", { Component: MrpModernSidebar });
