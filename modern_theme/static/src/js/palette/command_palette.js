import { Component, onMounted, useRef, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { useService } from "@web/core/utils/hooks";
import { fuzzyLookup } from "@web/core/utils/search";
import { debounce } from "@web/core/utils/timing";
import { user } from "@web/core/user";

import { appIcon, buildAppTree, flattenLeaves, paletteModels, registryGet, sidebarApps } from "../sidebar/menu_model";

const RECENT_KEY = "modern_theme.sidebar.recent";
let isOpen = false;

/**
 * Ctrl+K command palette: apps, menus (with their path), pinned & recent menus,
 * records (name search on the models registered in `modern_theme.palette_models`)
 * and quick theme actions. Odoo's own command palette stays one keystroke away.
 */
export class MtCommandPalette extends Component {
    static template = "modern_theme.CommandPalette";
    static props = { close: Function };

    setup() {
        this.menu = useService("menu");
        this.action = useService("action");
        this.orm = useService("orm");
        this.theme = useService("mt_theme");
        this.command = useService("command");
        this.input = useRef("input");
        this.list = useRef("list");
        this.state = useState({ query: "", active: 0, records: [], loadingRecords: false });
        this.menuItems = this.collectMenus();
        this.searchRecords = debounce(this.searchRecords.bind(this), 220);
        useHotkey("escape", () => this.props.close(), { bypassEditableProtection: true });
        onMounted(() => this.input.el?.focus());
    }

    collectMenus() {
        const items = [];
        for (const app of this.menu.getApps()) {
            const config = registryGet(sidebarApps, app.xmlid);
            for (const { node, parents } of flattenLeaves(buildAppTree(this.menu, app, config))) {
                items.push({
                    type: "menu",
                    id: `m${node.id}`,
                    menuId: node.id,
                    label: node.name,
                    hint: [app.name, ...parents.map((p) => p.name)].join(" / "),
                    icon: node.icon || "fa-circle-o",
                    app,
                });
            }
        }
        return items;
    }

    get apps() {
        return this.menu.getApps().map((app) => ({
            type: "app",
            id: `a${app.id}`,
            menuId: app.id,
            label: app.name,
            hint: _t("App"),
            app,
        }));
    }

    get themeActions() {
        const dark = this.theme.state.scheme === "dark";
        return [{
            key: "toggle-dark",
            label: dark ? _t("Light mode") : _t("Dark mode"),
            icon: dark ? "fa-sun-o" : "fa-moon-o",
            run: () => this.theme.toggleScheme(),
            hint: _t("Action"),
        }, {
            key: "odoo-commands",
            label: _t("Odoo commands…"),
            icon: "fa-terminal",
            run: () => this.command.openMainPalette(),
            hint: _t("Action"),
        }];
    }

    get pinned() {
        return this.theme.state.favorites
            .map((id) => this.menuItems.find((m) => m.menuId === id))
            .filter(Boolean)
            .map((m) => ({ ...m, id: `p${m.menuId}` }));
    }

    get recent() {
        let ids = [];
        try {
            ids = JSON.parse(browser.localStorage.getItem(RECENT_KEY)) || [];
        } catch {
            ids = [];
        }
        return ids
            .map((id) => this.menuItems.find((m) => m.menuId === id))
            .filter(Boolean)
            .slice(0, 5)
            .map((m) => ({ ...m, id: `r${m.menuId}` }));
    }

    /** Result groups, in display order. */
    get groups() {
        const q = this.state.query.trim();
        if (!q) {
            return [
                { title: _t("Pinned"), items: this.pinned },
                { title: _t("Recent"), items: this.recent },
                { title: _t("Apps"), items: this.apps },
                { title: _t("Appearance"), items: this.themeActions.slice(0, 6) },
            ].filter((g) => g.items.length);
        }
        const match = (list) => fuzzyLookup(q, list, (item) => `${item.label} ${item.hint || ""}`);
        return [
            { title: _t("Apps"), items: match(this.apps).slice(0, 5) },
            { title: _t("Menus"), items: match(this.menuItems).slice(0, 12) },
            { title: _t("Records"), items: this.state.records, loading: this.state.loadingRecords },
            { title: _t("Actions"), items: match(this.themeActions).slice(0, 6) },
        ].filter((g) => g.items.length || g.loading);
    }

    get flat() {
        return this.groups.flatMap((g) => g.items);
    }

    appIcon(app) {
        return appIcon(app);
    }

    onInput(ev) {
        this.state.query = ev.target.value;
        this.state.active = 0;
        if (this.state.query.trim().length >= 2) {
            this.state.loadingRecords = true;
            this.searchRecords(this.state.query.trim());
        } else {
            this.state.records = [];
            this.state.loadingRecords = false;
        }
    }

    async searchRecords(query) {
        const models = paletteModels.getEntries().map(([model, spec]) => ({ model, ...spec }));
        const results = await Promise.all(
            models.map(async (spec) => {
                try {
                    const allowed = await user.checkAccessRight(spec.model, "read");
                    if (!allowed) {
                        return [];
                    }
                    const rows = await this.orm.call(spec.model, "name_search", [], {
                        name: query,
                        domain: spec.domain || [],
                        limit: spec.limit || 4,
                    });
                    return rows.map(([id, name]) => ({
                        type: "record",
                        id: `rec_${spec.model}_${id}`,
                        resModel: spec.model,
                        resId: id,
                        label: name,
                        hint: spec.label,
                        icon: spec.icon || "fa-file-o",
                    }));
                } catch {
                    return [];
                }
            })
        );
        if (query !== this.state.query.trim()) {
            return; // a newer search is on its way
        }
        this.state.records = results.flat().slice(0, 10);
        this.state.loadingRecords = false;
    }

    onKeydown(ev) {
        const count = this.flat.length;
        if (!count) {
            return;
        }
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            this.state.active = (this.state.active + (ev.key === "ArrowDown" ? 1 : -1) + count) % count;
            browser.requestAnimationFrame(() =>
                this.list.el?.querySelector(".mt-cp-item.active")?.scrollIntoView({ block: "nearest" })
            );
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            this.execute(this.flat[this.state.active]);
        }
    }

    isActive(item) {
        return this.flat[this.state.active]?.id === item.id;
    }

    hover(item) {
        this.state.active = this.flat.findIndex((i) => i.id === item.id);
    }

    async execute(item) {
        if (!item) {
            return;
        }
        this.props.close();
        if (item.type === "menu" || item.type === "app") {
            await this.menu.selectMenu(item.menuId);
        } else if (item.type === "record") {
            await this.action.doAction({
                type: "ir.actions.act_window",
                res_model: item.resModel,
                res_id: item.resId,
                views: [[false, "form"]],
                target: "current",
            });
        } else if (item.type === "action") {
            await item.run();
        }
    }
}

export function openCommandPalette(env) {
    if (isOpen) {
        return;
    }
    isOpen = true;
    env.services.dialog.add(MtCommandPalette, {}, { onClose: () => (isOpen = false) });
}

// Ctrl+K opens this palette. Registered after Odoo's command service, so it wins.
export const mtPaletteService = {
    dependencies: ["hotkey", "dialog", "command", "mt_theme"],
    start(env, { hotkey, mt_theme }) {
        if (!mt_theme.state.enabled) {
            return;
        }
        hotkey.add("control+k", () => openCommandPalette(env), {
            bypassEditableProtection: true,
            global: true,
        });
    },
};

registry.category("services").add("mt_palette", mtPaletteService);

// Records the palette can find out of the box (apps add more).
paletteModels.add("res.partner", { label: _t("Contact"), icon: "fa-address-book-o" });
