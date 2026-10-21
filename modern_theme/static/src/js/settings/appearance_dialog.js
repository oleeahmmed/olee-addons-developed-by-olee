import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

import { PRESET_SWATCHES } from "../theme/theme_service";
import { OPTION_GROUPS, PRESET_LABELS } from "./options";

/**
 * "My appearance": every design option for the current user, applied and saved
 * instantly. Empty = follow the company default (set by an administrator).
 */
export class MtAppearanceDialog extends Component {
    static template = "modern_theme.AppearanceDialog";
    static components = { Dialog };
    static props = { close: Function };

    setup() {
        this.theme = useService("mt_theme");
        this.notification = useService("notification");
        this.themeState = useState(this.theme.state);
        this.groups = OPTION_GROUPS;
        this.presets = PRESET_LABELS;
        this.swatches = PRESET_SWATCHES;
        this.state = useState({ tab: "colors", saving: false });
    }

    setTab(key) {
        this.state.tab = key;
    }
    get values() {
        return this.themeState.values;
    }
    isOverridden(key) {
        const v = this.themeState.user[key];
        return v !== false && v !== undefined && v !== null && v !== "";
    }
    companyLabel(option) {
        const value = this.themeState.company[option.key];
        if (option.kind === "bool") {
            return value ? _t("On") : _t("Off");
        }
        return option.choices?.find((c) => c[0] === value)?.[1] || value || "";
    }
    get presetCompanyLabel() {
        const value = this.themeState.company.preset;
        return this.presets.find((p) => p[0] === value)?.[1] || _t("Custom color");
    }
    get customColor() {
        return this.values.primary_color || "#4f46e5";
    }

    async set(key, value) {
        this.state.saving = true;
        try {
            await this.theme.setUser({ [key]: value });
            if (key === "sidebar_collapsed") {
                this.env.bus.trigger("MT_SIDEBAR:COLLAPSE", { collapsed: Boolean(value) });
            }
        } finally {
            this.state.saving = false;
        }
    }
    setBool(key, ev) {
        return this.set(key, ev.target.checked);
    }
    resetKey(key) {
        return this.set(key, false);
    }
    setPreset(key) {
        return this.set("preset", key);
    }
    onCustomColor(ev) {
        const color = ev.target.value;
        // Live while dragging the picker, saved on "change".
        this.theme.preview({ preset: "custom", primary_color: color });
    }
    async saveCustomColor(ev) {
        this.state.saving = true;
        try {
            await this.theme.setUser({ preset: "custom", primary_color: ev.target.value });
        } finally {
            this.state.saving = false;
        }
    }
    async resetAll() {
        await this.theme.resetUser();
        this.notification.add(_t("You now follow the company appearance."), { type: "success" });
    }
}

export function openAppearanceDialog(env) {
    env.services.dialog.add(MtAppearanceDialog, {});
}

registry.category("actions").add("modern_theme.my_appearance", (env) => {
    openAppearanceDialog(env);
});

registry.category("user_menuitems").add(
    "modern_theme.appearance",
    (env) => ({
        type: "item",
        id: "mt_appearance",
        description: _t("Appearance"),
        callback: () => openAppearanceDialog(env),
        sequence: 45,
    }),
    { force: true }
);
