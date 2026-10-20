import { Component, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";

import { THEME_SWATCH_COLORS } from "@modern_theme/js/theme_preset_picker_field";

export const THEME_PRESET_OPTIONS = [
    ["indigo", "Indigo"],
    ["zinc", "Zinc"],
    ["slate", "Slate"],
    ["stone", "Stone"],
    ["gray", "Gray"],
    ["neutral", "Neutral"],
    ["red", "Red"],
    ["rose", "Rose"],
    ["orange", "Orange"],
    ["green", "Green"],
    ["blue", "Blue"],
    ["yellow", "Yellow"],
    ["violet", "Violet"],
    ["teal", "Teal"],
];

export class ThemeToggle extends Component {
    static template = "modern_theme.ThemeToggle";
    static components = { Dropdown, DropdownItem };
    static props = {};

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.isDark = Boolean(session.modern_theme?.dark_mode);
        this.canChangePreset = Boolean(session.modern_theme?.can_change_preset);
        this.presets = THEME_PRESET_OPTIONS;
        this.state = useState({
            preset: session.modern_theme?.preset || "blue",
        });
    }

    swatchColor(key) {
        return THEME_SWATCH_COLORS[key] || "#18181b";
    }

    async setDark(dark) {
        if (Boolean(dark) === this.isDark) {
            return;
        }
        await this.orm.write("res.users", [user.userId], {
            modern_theme_dark_mode: Boolean(dark),
        });
        window.location.reload();
    }

    async setPreset(key) {
        if (key === this.state.preset) {
            return;
        }
        if (!this.canChangePreset) {
            this.notification.add(
                "Only administrators can change the company theme color.",
                { type: "warning" }
            );
            return;
        }
        await this.orm.call("res.users", "modern_theme_set_preset", [key]);
        this.state.preset = key;
        if (session.modern_theme) {
            session.modern_theme.preset = key;
        }
        document.documentElement.setAttribute("data-mt-theme", key);
    }
}

export const systrayItem = {
    Component: ThemeToggle,
};

registry.category("systray").add("modern_theme.ThemeToggle", systrayItem, { sequence: 1 });
