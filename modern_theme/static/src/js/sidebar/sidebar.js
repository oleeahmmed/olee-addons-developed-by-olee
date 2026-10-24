import { Component, onMounted, onWillUnmount, useEffect, useRef, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { cookie } from "@web/core/browser/cookie";
import { routerBus } from "@web/core/browser/router";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useBus, useService } from "@web/core/utils/hooks";
import { imageUrl } from "@web/core/utils/urls";

import {
    appIcon,
    buildAppTree,
    findActiveLeaf,
    flattenLeaves,
    menuBadges,
    sideNodes,
    registryGet,
    sidebarApps,
} from "./menu_model";
import { openCommandPalette } from "../palette/command_palette";

const RECENT_KEY = "modern_theme.sidebar.recent";
const OPEN_KEY = "modern_theme.sidebar.open";
const PIN_COOKIE = "mt_sb_pinned";
const MAX_RECENT = 6;
const BADGE_TTL = 60_000;

function readJSON(key, fallback) {
    try {
        return JSON.parse(browser.localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}
function writeJSON(key, value) {
    try {
        browser.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // storage full / private mode: the sidebar still works, it just forgets.
    }
}

export class MtSidebar extends Component {
    static template = "modern_theme.Sidebar";
    static components = { Dropdown, DropdownItem };
    static props = {};

    setup() {
        this.menu = useService("menu");
        this.action = useService("action");
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.theme = useService("mt_theme");
        this.ui = useState(useService("ui"));
        this.themeState = useState(this.theme.state);
        this.root = useRef("root");
        this.navRef = useRef("nav");
        this.user = user;
        this.avatar = imageUrl("res.partner", user.partnerId, "avatar_128", { unique: user.writeDate });

        this.state = useState({
            rev: 0,
            collapsed: this.theme.isCollapsed(),
            pinned: cookie.get(PIN_COOKIE) !== "0",
            mobileOpen: false,
            fullscreen: false,
            open: readJSON(OPEN_KEY, {}),
            expandedApps: {},
            recent: readJSON(RECENT_KEY, []),
            lastClicked: null,
            flyout: null,
            badges: {},
            rights: {},
        });
        this.badgeStamp = {};
        this.flyoutTimer = null;

        const refresh = () => {
            this.state.rev++;
        };
        useBus(this.env.bus, "MENUS:APP-CHANGED", () => {
            refresh();
            this.loadBadges();
            this.syncAppClass();
        });
        useBus(this.env.bus, "ACTION_MANAGER:UI-UPDATED", ({ detail: mode }) => {
            if (mode !== "new") {
                this.state.fullscreen = mode === "fullscreen";
            }
            refresh();
            this.rememberRecent();
            this.state.mobileOpen = false;
        });
        useBus(routerBus, "ROUTE_CHANGE", refresh);
        useBus(this.env.bus, "MT_SIDEBAR:TOGGLE", () => this.toggleMobile());
        useBus(this.env.bus, "MT_SIDEBAR:COLLAPSE", ({ detail }) => {
            this.state.collapsed = Boolean(detail?.collapsed);
            this.theme.setCollapsed(this.state.collapsed);
        });

        // shadcn inset layout: once the page is scrolled, html.mt-scrolled lets the
        // content card's top gap and rounded corners go (layout scss: sidebar_shadcn).
        const lastTop = new WeakMap();
        const onScroll = (ev) => {
            const el = ev.target;
            if (!(el instanceof Element) || !el.closest(".o_action_manager")) {
                return;
            }
            if (lastTop.get(el) === el.scrollTop) {
                return; // horizontal scroll (kanban columns): not a page scroll
            }
            lastTop.set(el, el.scrollTop);
            document.documentElement.classList.toggle("mt-scrolled", el.scrollTop > 4);
        };
        useBus(this.env.bus, "ACTION_MANAGER:UI-UPDATED", () => {
            document.documentElement.classList.remove("mt-scrolled");
        });

        onMounted(() => {
            this.syncAppClass();
            this.loadBadges();
            document.documentElement.classList.add("mt-has-sidebar");
            document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        });
        onWillUnmount(() => {
            document.documentElement.classList.remove("mt-has-sidebar", "mt-scrolled");
            document.removeEventListener("scroll", onScroll, { capture: true });
            browser.clearTimeout(this.flyoutTimer);
        });
        // Layout flags on <html>, read by layout.scss (offset, overlay…).
        useEffect(
            (style, pinned, fullscreen, mobileOpen, small, panel) => {
                const html = document.documentElement;
                html.setAttribute("data-mt-sb-pinned", pinned ? "1" : "0");
                html.setAttribute("data-mt-sb-panel", panel ? "1" : "0");
                html.classList.toggle("mt-fullscreen", fullscreen);
                html.classList.toggle("mt-sb-mobile-open", mobileOpen && small);
            },
            () => [
                this.style,
                this.state.pinned,
                this.state.fullscreen,
                this.state.mobileOpen,
                this.ui.isSmall,
                Boolean(this.showPanel),
            ]
        );
    }

    // ------------------------------------------------------------------
    // Data
    // ------------------------------------------------------------------
    get style() {
        return this.themeState.values.sidebar_style || "classic";
    }
    /** Style drawn: on phones the rail and floating styles become the classic drawer. */
    get dataStyle() {
        const style = this.style;
        return this.ui.isSmall && (style === "rail" || style === "floating") ? "classic" : style;
    }
    get collapsed() {
        // The rail is always icon-sized; its panel uses "pinned" instead.
        return this.state.collapsed && !this.ui.isSmall && this.style !== "rail";
    }
    get apps() {
        this.state.rev;
        return this.menu.getApps();
    }
    get currentApp() {
        this.state.rev;
        return this.menu.getCurrentApp() || null;
    }
    configFor(app) {
        return app ? registryGet(sidebarApps, app.xmlid) : null;
    }
    get config() {
        return this.configFor(this.currentApp);
    }
    treeFor(app) {
        if (!app) {
            return [];
        }
        // Cache per render revision: rebuilt after any navigation / menu reload.
        if (this._treeRev !== this.state.rev) {
            this._treeRev = this.state.rev;
            this._trees = {};
        }
        if (!this._trees[app.id]) {
            this._trees[app.id] = buildAppTree(this.menu, app, this.configFor(app));
        }
        return this._trees[app.id];
    }
    get tree() {
        return this.treeFor(this.currentApp);
    }
    /** What the sidebar lists for an app: its everyday pages (the rest is in the top bar). */
    sideTreeFor(app) {
        // On phones the top bar has no room: everything stays in the (drawer) sidebar.
        return this.ui.isSmall ? this.treeFor(app) : sideNodes(this.treeFor(app));
    }
    get sideTree() {
        return this.sideTreeFor(this.currentApp);
    }
    get activeLeaf() {
        this.state.rev;
        const app = this.currentApp;
        if (!app) {
            return null;
        }
        const leaves = flattenLeaves(this.tree);
        // The URL is updated a moment after the action is shown: the menu just clicked
        // wins while its action is the one on screen (else the previous page stays lit).
        const clicked = this.state.lastClicked && leaves.find((l) => l.node.id === this.state.lastClicked);
        const actionId = this.action.currentController?.action?.id;
        if (clicked && actionId && clicked.node.actionID === actionId) {
            return clicked;
        }
        return findActiveLeaf(leaves, browser.location.pathname, this.state.lastClicked);
    }
    get activeId() {
        return this.activeLeaf?.node.id || null;
    }
    isActive(node) {
        return node.id === this.activeId;
    }
    containsActive(node) {
        const active = this.activeLeaf;
        return Boolean(active && active.parents.some((p) => p.id === node.id));
    }
    appIcon(app) {
        return appIcon(app);
    }
    get favorites() {
        this.state.rev;
        return this.themeState.favorites
            .map((id) => this.menu.getMenu(id))
            .filter((m) => m && (m.actionID || m.actionPath))
            .map((m) => this.leafFromMenu(m));
    }
    get recent() {
        this.state.rev;
        return this.state.recent
            .filter((id) => !this.themeState.favorites.includes(id))
            .map((id) => this.menu.getMenu(id))
            .filter((m) => m && (m.actionID || m.actionPath))
            .slice(0, 5)
            .map((m) => this.leafFromMenu(m));
    }
    leafFromMenu(m) {
        const app = this.menu.getMenu(m.appID);
        return {
            id: m.id,
            name: m.name,
            xmlid: m.xmlid,
            href: `/odoo/${m.actionPath || "action-" + m.actionID}`,
            actionID: m.actionID,
            app,
            appName: app && app.id !== m.id ? app.name : "",
        };
    }
    /** Floating style: top-level groups become titled sections; loose items go first. */
    get sections() {
        const loose = this.sideTree.filter((n) => !n.children.length);
        const groups = this.sideTree.filter((n) => n.children.length);
        const result = [];
        if (loose.length) {
            result.push({ key: "main", title: "", nodes: loose, node: null });
        }
        for (const node of groups) {
            result.push({ key: `g${node.id}`, title: node.name, nodes: node.children, node });
        }
        return result;
    }
    get legacyClass() {
        // Hidden marker that keeps the old per-app CSS / JS hooks (.o_cm_sidebar…) working.
        const prefix = this.config?.legacyPrefix;
        return prefix ? `o_${prefix}_sidebar` : "";
    }
    get brandName() {
        return user.activeCompany?.name || "";
    }
    get brandLogo() {
        const id = user.activeCompany?.id;
        return id ? `/web/binary/company_logo?company=${id}` : "/web/binary/company_logo";
    }

    // ------------------------------------------------------------------
    // Open / closed groups
    // ------------------------------------------------------------------
    isOpen(node) {
        const saved = this.state.open[node.id];
        if (saved !== undefined) {
            return saved || this.containsActive(node);
        }
        return !node.secondary || this.containsActive(node);
    }
    toggleGroup(node, ev) {
        ev?.stopPropagation();
        this.state.open[node.id] = !this.isOpen(node);
        writeJSON(OPEN_KEY, this.state.open);
    }
    toggleRecent() {
        this.state.open.recent = !this.state.open.recent;
        writeJSON(OPEN_KEY, this.state.open);
    }
    // ------------------------------------------------------------------
    // Classic style: every other installed app, as collapsible items (shadcn
    // "E-commerce ›" rows) whose sub-items are that app's everyday pages.
    // ------------------------------------------------------------------
    /** Classic style: "top" / "bottom" / "hidden" (theme option "Current app menu"). */
    get appMenuPosition() {
        return this.themeState.values.sidebar_app_menu || "top";
    }
    get showAppGroup() {
        return Boolean(this.currentApp && this.sideTree.length && this.appMenuPosition !== "hidden");
    }
    isAppGroupOpen() {
        return this.state.open.curApp !== false; // open unless the user folded it
    }
    toggleAppGroup(ev) {
        ev?.stopPropagation();
        this.state.open.curApp = !this.isAppGroupOpen();
        writeJSON(OPEN_KEY, this.state.open);
    }
    /** Apps group: every other app; with the app group hidden, the current one too. */
    get otherApps() {
        const current = this.currentApp;
        if (this.appMenuPosition === "hidden" || !this.sideTree.length) {
            return this.apps;
        }
        return this.apps.filter((app) => app.id !== current?.id);
    }
    appHasMenus(app) {
        return Boolean(this.menu.getMenu(app.id)?.children?.length);
    }
    appLeaves(app) {
        return flattenLeaves(this.sideTreeFor(app)).map((leaf) => leaf.node);
    }
    isAppOpen(app) {
        const saved = this.state.open[`app${app.id}`];
        if (saved !== undefined) {
            return saved;
        }
        return app.id === this.currentApp?.id; // the open app starts expanded
    }
    onAppItem(app, ev) {
        if (this.collapsed || !this.appHasMenus(app)) {
            return this.openApp(app, ev);
        }
        ev?.preventDefault();
        ev?.stopPropagation();
        this.state.open[`app${app.id}`] = !this.isAppOpen(app);
        writeJSON(OPEN_KEY, this.state.open);
    }

    isAppExpanded(app) {
        const v = this.state.expandedApps[app.id];
        return v === undefined ? app.id === this.currentApp?.id : v;
    }
    toggleApp(app, ev) {
        ev?.stopPropagation();
        this.state.expandedApps[app.id] = !this.isAppExpanded(app);
    }

    // ------------------------------------------------------------------
    // Navigation
    // ------------------------------------------------------------------
    async openNode(node, ev) {
        if (ev && (ev.ctrlKey || ev.metaKey || ev.button === 1)) {
            return; // let the browser open a new tab
        }
        ev?.preventDefault();
        this.state.lastClicked = node.id;
        this.closeFlyout(true);
        this.state.mobileOpen = false;
        const menu = this.menu.getMenu(node.id);
        if (menu) {
            await this.menu.selectMenu(menu);
        }
    }
    async openApp(app, ev) {
        ev?.preventDefault();
        if (this.style === "tree" && !this.collapsed) {
            this.state.expandedApps[app.id] = true;
        }
        this.closeFlyout(true);
        await this.menu.selectMenu(app);
    }
    /** Workspace header (classic style): back to the home screen / first app. */
    async openHome(ev) {
        if (ev && (ev.ctrlKey || ev.metaKey || ev.button === 1)) {
            return;
        }
        ev?.preventDefault();
        this.closeFlyout(true);
        this.state.mobileOpen = false;
        const app = this.currentApp || this.apps[0];
        if (app) {
            await this.menu.selectMenu(app);
        }
    }
    rememberRecent() {
        const id = this.activeId;
        if (!id) {
            return;
        }
        const list = [id, ...this.state.recent.filter((r) => r !== id)].slice(0, MAX_RECENT);
        if (list.join() !== this.state.recent.join()) {
            this.state.recent = list;
            writeJSON(RECENT_KEY, list);
        }
    }
    syncAppClass() {
        // Modern app addons register a config: their pages get the "modern app" styles.
        const config = this.config;
        const html = document.documentElement;
        html.classList.toggle("mt-app-modern", Boolean(config?.legacyPrefix));
        html.setAttribute("data-mt-app", this.currentApp?.xmlid?.split(".")[0] || "");
    }

    // ------------------------------------------------------------------
    // Collapse / pin / mobile
    // ------------------------------------------------------------------
    toggleCollapse() {
        this.state.collapsed = !this.state.collapsed;
        this.theme.setCollapsed(this.state.collapsed);
        this.closeFlyout(true);
    }
    togglePin() {
        this.state.pinned = !this.state.pinned;
        cookie.set(PIN_COOKIE, this.state.pinned ? "1" : "0");
        this.closeFlyout(true);
    }
    toggleMobile() {
        this.state.mobileOpen = !this.state.mobileOpen;
    }
    get showPanel() {
        // Rail style: the second panel is docked when pinned, else it is a flyout.
        return this.style === "rail" && this.state.pinned && this.sideTree.length > 0;
    }

    // ------------------------------------------------------------------
    // Flyouts (rail hover, collapsed popovers)
    // ------------------------------------------------------------------
    openFlyout(ev, { app = null, node = null } = {}) {
        if (this.ui.isSmall) {
            return;
        }
        if (this.style === "rail" && this.state.pinned && app && app.id === this.currentApp?.id) {
            this.closeFlyout(true);
            return;
        }
        const rect = ev.currentTarget.getBoundingClientRect();
        const sideRect = this.root.el?.getBoundingClientRect();
        const title = app ? app.name : node.name;
        const nodes = app ? this.sideTreeFor(app) : node.children;
        browser.clearTimeout(this.flyoutTimer);
        this.flyoutTimer = browser.setTimeout(() => {
            const maxTop = browser.innerHeight - Math.min(480, 60 + nodes.length * 34);
            this.state.flyout = {
                key: app ? `a${app.id}` : `n${node.id}`,
                title,
                app,
                node: app ? null : node,
                nodes,
                top: Math.max(8, Math.min(rect.top - 6, maxTop)),
                left: (sideRect?.right || rect.right) + 6,
            };
        }, this.state.flyout ? 0 : 90);
    }
    keepFlyout() {
        browser.clearTimeout(this.flyoutTimer);
    }
    closeFlyout(now = false) {
        browser.clearTimeout(this.flyoutTimer);
        if (now) {
            this.state.flyout = null;
            return;
        }
        this.flyoutTimer = browser.setTimeout(() => (this.state.flyout = null), 220);
    }

    // ------------------------------------------------------------------
    // Badges (counters)
    // ------------------------------------------------------------------
    async loadBadges() {
        const app = this.currentApp;
        if (!app) {
            return;
        }
        const now = Date.now();
        if (this.badgeStamp[app.id] && now - this.badgeStamp[app.id] < BADGE_TTL) {
            return;
        }
        this.badgeStamp[app.id] = now;
        const leaves = flattenLeaves(this.tree);
        await Promise.all(
            leaves.map(async ({ node }) => {
                const fetcher = registryGet(menuBadges, node.xmlid);
                if (!fetcher) {
                    return;
                }
                try {
                    const value = await fetcher(this.env);
                    this.state.badges[node.id] = value || null;
                } catch {
                    this.state.badges[node.id] = null;
                }
            })
        );
    }
    badge(node) {
        const value = this.state.badges[node.id];
        if (!value) {
            return "";
        }
        return value > 99 ? "99+" : String(value);
    }

    // ------------------------------------------------------------------
    // "+ New": no longer drawn in the sidebar (each page has one "New" button, top
    // left of the page title). The helpers stay so app addons that register
    // createTargets / onCreate keep working without changes.
    // ------------------------------------------------------------------
    get createSpec() {
        const config = this.config;
        if (!config?.createTargets) {
            return null;
        }
        const active = this.activeLeaf;
        if (active) {
            for (const node of [active.node, ...active.parents.slice().reverse()]) {
                const spec = registryGet(config.createTargets, node.xmlid);
                if (spec) {
                    return spec;
                }
            }
        }
        const controllerAction = this.action.currentController?.action;
        const model = controllerAction?.res_model;
        const noCreate = new Set(config.noCreate || ["mail.activity"]);
        if (model && !noCreate.has(model) && controllerAction.context?.create !== false) {
            const all = config.createTargets.getAll ? config.createTargets.getAll() : Object.values(config.createTargets);
            const known = all.find((spec) => spec.resModel === model);
            if (known) {
                return known;
            }
        }
        return registryGet(config.createTargets, config.defaultCreate);
    }
    async loadRights() {
        const spec = this.createSpec;
        const model = spec?.resModel;
        if (model && !(model in this.state.rights)) {
            this.state.rights[model] = await user.checkAccessRight(model, "create").catch(() => false);
        }
    }
    get canCreate() {
        const model = this.createSpec?.resModel;
        return Boolean(model) && this.state.rights[model] === true;
    }
    async onCreate() {
        const spec = this.createSpec;
        if (!spec) {
            return;
        }
        this.state.mobileOpen = false;
        const handled = this.config?.onCreate ? await this.config.onCreate(spec, this.env) : false;
        if (handled) {
            return;
        }
        await this.action.doAction({
            type: "ir.actions.act_window",
            name: spec.label,
            res_model: spec.resModel,
            views: [[false, "form"]],
            target: "current",
            context: { ...(spec.context || {}) },
        });
    }

    // ------------------------------------------------------------------
    // Favorites, search, user menu
    // ------------------------------------------------------------------
    isFavorite(node) {
        return this.themeState.favorites.includes(node.id);
    }
    toggleFavorite(node, ev) {
        ev?.preventDefault();
        ev?.stopPropagation();
        this.theme.toggleFavorite(node.id);
    }
    openSearch() {
        this.state.mobileOpen = false;
        openCommandPalette(this.env);
    }
    get userMenuItems() {
        return registry
            .category("user_menuitems")
            .getAll()
            .map((element) => element(this.env))
            .filter((element) => (element.show ? element.show() : true) && !element.hide)
            .filter((element) => element.type === "item" || element.type === "separator")
            .sort((a, b) => (a.sequence || 100) - (b.sequence || 100));
    }
    onUserItem(element) {
        element.callback?.();
    }
    setMode(mode) {
        this.theme.setUser({ color_mode: mode });
    }

    // ------------------------------------------------------------------
    // Keyboard navigation inside the sidebar
    // ------------------------------------------------------------------
    onNavKeydown(ev) {
        const items = [...(this.root.el?.querySelectorAll(".mt-sb-focusable") || [])].filter(
            (el) => el.offsetParent !== null
        );
        const index = items.indexOf(document.activeElement);
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            const next = ev.key === "ArrowDown" ? index + 1 : index - 1;
            items[(next + items.length) % items.length]?.focus();
        } else if (ev.key === "Escape") {
            this.closeFlyout(true);
            this.state.mobileOpen = false;
        } else if ((ev.key === "ArrowRight" || ev.key === "ArrowLeft") && document.activeElement?.dataset.groupId) {
            ev.preventDefault();
            const id = Number(document.activeElement.dataset.groupId);
            const wantOpen = ev.key === "ArrowRight";
            this.state.open[id] = wantOpen;
            writeJSON(OPEN_KEY, this.state.open);
        }
    }

    get modeLabel() {
        return { light: _t("Light"), dark: _t("Dark"), auto: _t("Auto") }[this.themeState.values.color_mode] || "";
    }
}

registry.category("main_components").add("modern_theme.Sidebar", { Component: MtSidebar });
