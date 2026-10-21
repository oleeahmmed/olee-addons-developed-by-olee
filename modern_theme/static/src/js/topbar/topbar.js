import { Component, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useBus, useService } from "@web/core/utils/hooks";
import { NavBar } from "@web/webclient/navbar/navbar";

import { openCommandPalette } from "../palette/command_palette";
import { openAppearanceDialog } from "../settings/appearance_dialog";
import { PRESET_LABELS } from "../settings/options";
import { PRESET_SWATCHES } from "../theme/theme_service";
import { appIcon } from "../sidebar/menu_model";

/**
 * Left part of the top bar: mobile menu button, current app, search pill.
 * Injected into Odoo's NavBar through a small template extension (navbar.xml).
 */
export class MtTopbarStart extends Component {
    static template = "modern_theme.TopbarStart";
    static props = {};

    setup() {
        this.menu = useService("menu");
        this.ui = useState(useService("ui"));
        this.theme = useState(useService("mt_theme").state);
        this.state = useState({ rev: 0 });
        useBus(this.env.bus, "MENUS:APP-CHANGED", () => this.state.rev++);
    }
    get app() {
        this.state.rev;
        return this.menu.getCurrentApp();
    }
    appIcon(app) {
        return appIcon(app);
    }
    toggleSidebar() {
        this.env.bus.trigger("MT_SIDEBAR:TOGGLE");
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
