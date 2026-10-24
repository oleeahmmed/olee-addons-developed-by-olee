import { Component, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { routerBus } from "@web/core/browser/router";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useBus, useService } from "@web/core/utils/hooks";
import { NavBar } from "@web/webclient/navbar/navbar";

import { openCommandPalette } from "../palette/command_palette";
import { openAppearanceDialog } from "../settings/appearance_dialog";
import { PRESET_LABELS } from "../settings/options";
import { PRESET_SWATCHES } from "../theme/theme_service";
import {
    appIcon,
    buildAppTree,
    findActiveLeaf,
    flattenLeaves,
    registryGet,
    sidebarApps,
    topNodes,
} from "../sidebar/menu_model";

/**
 * Left part of the top bar: mobile menu button, current app, search pill.
 * Injected into Odoo's NavBar through a small template extension (navbar.xml).
 */
export class MtTopbarStart extends Component {
    static template = "modern_theme.TopbarStart";
    static components = { Dropdown, DropdownItem };
    static props = {};

    setup() {
        this.menu = useService("menu");
        this.ui = useState(useService("ui"));
        this.themeService = useService("mt_theme");
        this.theme = useState(this.themeService.state);
        this.state = useState({ rev: 0 });
        const refresh = () => this.state.rev++;
        useBus(this.env.bus, "MENUS:APP-CHANGED", refresh);
        useBus(this.env.bus, "ACTION_MANAGER:UI-UPDATED", refresh);
        useBus(routerBus, "ROUTE_CHANGE", refresh);
    }
    get app() {
        this.state.rev;
        return this.menu.getCurrentApp();
    }
    /**
     * The current app's less used menus, as top bar dropdowns: Odoo's other groups,
     * then Reporting, then Configuration. The sidebar keeps the everyday pages.
     */
    get topMenus() {
        const app = this.app;
        if (!app || this.ui.isSmall) {
            return [];
        }
        if (this._rev !== this.state.rev) {
            this._rev = this.state.rev;
            const tree = buildAppTree(this.menu, app, registryGet(sidebarApps, app.xmlid));
            this._top = topNodes(tree);
            const leaf = findActiveLeaf(flattenLeaves(this._top), browser.location.pathname);
            this._activeIds = new Set(leaf ? [leaf.node.id, ...leaf.parents.map((p) => p.id)] : []);
        }
        return this._top;
    }
    isActive(node) {
        this.topMenus;
        return this._activeIds?.has(node.id);
    }
    /** Entries of a top bar dropdown: leaves, with a small heading before each sub-group. */
    entries(node) {
        const out = [];
        // Leaves first (under the group's own heading), then each sub-group with its heading.
        const walk = (group, withHeading) => {
            const leaves = group.children.filter((c) => !c.children.length);
            if (leaves.length && withHeading) {
                out.push({ id: `h${group.id}`, heading: true, name: group.name });
            }
            out.push(...leaves);
            for (const sub of group.children.filter((c) => c.children.length)) {
                walk(sub, true);
            }
        };
        walk(node, false);
        return out;
    }
    topIcon(node) {
        return node.kind === "report" ? "fa-bar-chart" : node.kind === "config" ? "fa-cog" : node.icon || "fa-th-large";
    }
    async openNode(node, ev) {
        if (ev && (ev.ctrlKey || ev.metaKey)) {
            return;
        }
        ev?.preventDefault();
        const menu = this.menu.getMenu(node.id);
        if (menu) {
            await this.menu.selectMenu(menu);
        }
    }
    appIcon(app) {
        return appIcon(app);
    }
    toggleSidebar() {
        this.env.bus.trigger("MT_SIDEBAR:TOGGLE");
    }
    /** All apps, for the apps menu that is always in the top bar. */
    get apps() {
        this.state.rev;
        return this.menu.getApps();
    }
    isCurrentApp(item) {
        return item.id === this.app?.id;
    }
    appHref(app) {
        return `/odoo/${app.actionPath || "action-" + app.actionID}`;
    }
    async openApp(app, ev) {
        if (ev && (ev.ctrlKey || ev.metaKey)) {
            return;
        }
        ev?.preventDefault();
        await this.menu.selectMenu(app);
    }
    /** Classic (shadcn) style: the collapse button sits in the top bar, like shadcn's SidebarTrigger. */
    get showCollapse() {
        return !this.ui.isSmall && (this.theme.values.sidebar_style || "classic") === "classic";
    }
    toggleCollapse() {
        const collapsed = !this.themeService.isCollapsed();
        this.env.bus.trigger("MT_SIDEBAR:COLLAPSE", { collapsed });
        this.state.rev++;
    }
    openSearch() {
        openCommandPalette(this.env);
    }
}

NavBar.components = { ...NavBar.components, MtTopbarStart };

/**
 * Systray: quick appearance switcher (mode, brand colour, sidebar style).
 * Everything is a personal choice; administrators set the company defaults in Settings.
 */
export class MtThemeSwitcher extends Component {
    static template = "modern_theme.ThemeSwitcher";
    static components = { Dropdown };
    static props = {};

    setup() {
        this.theme = useService("mt_theme");
        this.state = useState(this.theme.state);
        this.presets = PRESET_LABELS;
        this.swatches = PRESET_SWATCHES;
        this.styles = [
            ["classic", _t("Classic")],
            ["tree", _t("Tree")],
            ["rail", _t("Rail")],
            ["floating", _t("Floating")],
        ];
    }
    get isDark() {
        return this.state.scheme === "dark";
    }
    set(key, value) {
        return this.theme.setUser({ [key]: value });
    }
    toggleDark() {
        return this.set("color_mode", this.isDark ? "light" : "dark");
    }
    openMore() {
        openAppearanceDialog(this.env);
    }
}

registry.category("systray").add("modern_theme.ThemeSwitcher", { Component: MtThemeSwitcher }, { sequence: 1 });
