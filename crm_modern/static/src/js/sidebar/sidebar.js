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
import { loadFeatures } from "../core/features";

/**
 * Modern CRM left sidebar.
 *
 * Upgrade-safe by design: it is a standalone main component that only uses the
 * public `menu`, `ui` and `action` services. It does not patch or xpath Odoo's
 * NavBar template, so changes to the navbar in an Odoo update cannot break the
 * web client. The app's top-bar section menus are hidden with CSS (sidebar.scss).
 *
 * It shows the whole CRM app menu, nothing hidden: Modern CRM's own groups (Dashboard,
 * Deals, Marketing, Team, Reporting, Configuration) with Odoo's matching CRM menus
 * merged into them, minus the entries Modern CRM already shows with its own page; every
 * other CRM menu (other apps' too) as its own group, named as in Odoo, with a small
 * heading per sub-section. Odoo's groups and settings decide what each user sees.
 */
const APP_XMLID = "crm.crm_menu_root";
const OWN_PREFIXES = ["crm_modern."];
// Odoo / CRM Simple top-level menus whose entries go into one of our groups
const MERGE_INTO = {
    "crm.crm_menu_sales": "crm_modern.menu_sales",
    "crm.crm_menu_leads": "crm_modern.menu_sales",
    "crm.crm_lead_menu_my_activities": "crm_modern.menu_sales",
    "crm.res_partner_menu_customer": "crm_modern.menu_sales",
    "crm.crm_menu_report": "crm_modern.menu_reporting",
    "crm.crm_menu_config": "crm_modern.menu_config",
};
// Groups shown as dropdowns in the top bar instead of the sidebar, so the sidebar
// only lists the everyday pages. Groups other apps add are top-bar dropdowns too.
const TOP_GROUPS = new Set(["crm_modern.menu_team", "crm_modern.menu_reporting", "crm_modern.menu_config"]);
const TOP_ICONS = { reporting: "fa-bar-chart", config: "fa-cog", team: "fa-users" };
// Odoo entries replaced by a Modern CRM page / menu on the same records
const REPLACED = new Set([
    "crm.menu_crm_opportunities",
    "crm.crm_menu_leads",
    "crm.crm_lead_menu_my_activities",
    "crm.sales_team_menu_team_pipeline",
    "crm.crm_team_config",
    "crm.crm_team_menu_config_activity_types",
    "crm.mail_activity_plan_menu_config_lead",
    "crm.menu_crm_lead_stage_act",
    "crm.menu_crm_lead_categ",
    "crm.menu_crm_lost_reason",
    "crm.crm_config_settings_menu",
    "crm.crm_menu_forecast",
    "crm.crm_opportunity_report_menu",
    "crm.crm_opportunity_report_menu_lead",
    "crm.crm_activity_report_menu",
    "sale_crm.sale_order_menu_quotations_crm",
]);
const COLLAPSE_KEY = "crm_modern.sidebar.collapsed";

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("crm_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "crm_modern.menu_home": "fa-home",
    "crm_modern.menu_dashboard": "fa-th-large",
    "crm_modern.menu_pipeline": "fa-columns",
    "crm_modern.menu_leads": "fa-user-plus",
    "crm_modern.menu_activities": "fa-clock-o",
    "crm_modern.menu_campaigns": "fa-bullhorn",
    "crm_modern.menu_salespeople": "fa-user",
    "crm_modern.menu_teams": "fa-users",
    "crm_modern.menu_stages": "fa-list-ol",
    "crm_modern.menu_activity_types": "fa-th",
    "crm_modern.menu_activity_plans": "fa-tasks",
    "crm_modern.menu_tags": "fa-tags",
    "crm_modern.menu_settings": "fa-cog",
    "crm_modern.menu_lost_reasons": "fa-ban",
    "crm_modern.menu_forecast": "fa-line-chart",
    "crm_modern.menu_report_pipeline": "fa-bar-chart",
    "crm_modern.menu_report_leads": "fa-pie-chart",
    "crm_modern.menu_report_activities": "fa-area-chart",
    // Odoo's own CRM menus
    "crm.menu_crm_opportunities": "fa-columns",
    "crm.crm_lead_menu_my_activities": "fa-clock-o",
    "crm.sales_team_menu_team_pipeline": "fa-users",
    "crm.res_partner_menu_customer": "fa-address-book-o",
    "crm.crm_menu_leads": "fa-user-plus",
    "crm.crm_menu_forecast": "fa-line-chart",
    "crm.crm_opportunity_report_menu": "fa-bar-chart",
    "crm.crm_opportunity_report_menu_lead": "fa-pie-chart",
    "crm.crm_activity_report_menu": "fa-area-chart",
    "crm.crm_config_settings_menu": "fa-cog",
    "crm.crm_team_config": "fa-users",
    "crm.crm_team_member_config": "fa-user",
    "crm.crm_team_menu_config_activity_types": "fa-th",
    "crm.mail_activity_plan_menu_config_lead": "fa-tasks",
    "crm.crm_recurring_plan_menu_config": "fa-repeat",
    "crm.menu_crm_lead_stage_act": "fa-list-ol",
    "crm.menu_crm_lead_categ": "fa-tags",
    "crm.menu_crm_lost_reason": "fa-ban",
    "sale_crm.sale_order_menu_quotations_crm": "fa-file-text-o",
    // CRM Simple
})) {
    menuIcons.add(xmlid, icon);
}

/**
 * What the sidebar's "+" button creates, one entry per page: the model behind
 * the page you are on and the label shown on the button.
 */
export const createTargets = registry.category("crm_modern.create_targets");
for (const [xmlid, spec] of Object.entries({
    "crm_modern.menu_pipeline": { resModel: "crm.lead", label: _t("New opportunity"), context: { default_type: "opportunity" } },
    "crm_modern.menu_leads": { resModel: "crm.lead", label: _t("New lead"), context: { default_type: "lead" } },
    "crm_modern.menu_campaigns": { resModel: "utm.campaign", label: _t("New campaign") },
    "crm_modern.menu_quotations": { resModel: "sale.order", label: _t("New quotation") },
    "crm_modern.menu_sale_orders": { resModel: "sale.order", label: _t("New sales order") },
    "crm_modern.menu_salespeople": { resModel: "crm.team.member", label: _t("New salesperson") },
    "crm_modern.menu_teams": { resModel: "crm.team", label: _t("New sales team") },
    "crm_modern.menu_stages": { resModel: "crm.stage", label: _t("New stage") },
    "crm_modern.menu_activity_types": { resModel: "mail.activity.type", label: _t("New activity type") },
    "crm_modern.menu_activity_plans": { resModel: "mail.activity.plan", label: _t("New activity plan") },
    "crm_modern.menu_tags": { resModel: "crm.tag", label: _t("New tag") },
    "crm_modern.menu_lost_reasons": { resModel: "crm.lost.reason", label: _t("New lost reason") },
})) {
    createTargets.add(xmlid, spec);
}
/** Page the "+" falls back to when the current page has nothing to create. */
const DEFAULT_CREATE = "crm_modern.menu_pipeline";
/** Models a page shows but that are not created on their own (e.g. activities need a record). */
const NO_CREATE = new Set(["mail.activity"]);

export class ModernSidebar extends Component {
    static template = "crm_modern.Sidebar";
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
        this.cmUser = { id: user.userId, name: user.name, login: user.login };
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
            const [allowed, features] = await Promise.all([
                Promise.all(models.map((m) => user.checkAccessRight(m, "create").catch(() => false))),
                loadFeatures(this.orm).catch(() => ({})),
            ]);
            this.state.rights = Object.fromEntries(models.map((m, i) => [m, allowed[i]]));
            if (!features.sale) {
                this.state.rights["sale.order"] = false;
            }
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
                odoo.push({ ...menu, childrenTree: entries });
            }
        }
        for (const section of [...own, ...odoo]) {
            // drop headings left without items after the merge
            section.childrenTree = section.childrenTree.filter(
                (e, i, all) => !e.heading || (all[i + 1] && !all[i + 1].heading)
            );
        }
        return [...own, ...odoo].filter((s) => s.childrenTree.length || s.actionID || s.actionPath);
    }
    /** Leaves of an Odoo menu, with a small heading before each nested sub-group. */
    entries(menu) {
        const children = menu.childrenTree || [];
        if (!children.length) {
            return menu.actionID || menu.actionPath ? [menu] : [];
        }
        const result = [];
        for (const child of children) {
            if (child.childrenTree?.length) {
                const sub = this.entries(child);
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
        return this.app?.name || _t("CRM");
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
    get createSpec() {
        return this.pageCreateSpec || this.actionCreateSpec || createTargets.get(DEFAULT_CREATE, null);
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

registry.category("main_components").add("crm_modern.Sidebar", { Component: ModernSidebar });
