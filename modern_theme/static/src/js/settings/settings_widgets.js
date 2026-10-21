import { Component, onWillUnmount, useEffect, useRef } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";

import { PRESET_SWATCHES } from "../theme/theme_service";
import { FACTORY_DEFAULTS, PRESET_LABELS } from "./options";

const KEYS = Object.keys(FACTORY_DEFAULTS);

// ---------------------------------------------------------------------------
// Field widgets for Settings > Modern Theme
// ---------------------------------------------------------------------------

/** Selection as a segmented control (any selection field). */
export class MtSegmentedField extends Component {
    static template = "modern_theme.SegmentedField";
    static props = { ...standardFieldProps };
    get options() {
        return this.props.record.fields[this.props.name].selection.filter(([v]) => v);
    }
    get value() {
        return this.props.record.data[this.props.name];
    }
    select(value) {
        if (!this.props.readonly) {
            this.props.record.update({ [this.props.name]: value });
        }
    }
}
registry.category("fields").add("mt_segmented", {
    component: MtSegmentedField,
    displayName: _t("Segmented choice"),
    supportedTypes: ["selection"],
});

/** Brand colour: preset swatches (+ "Custom" uses the colour field next to it). */
export class MtSwatchField extends Component {
    static template = "modern_theme.SwatchField";
    static props = { ...standardFieldProps };
    setup() {
        this.presets = PRESET_LABELS;
        this.swatches = PRESET_SWATCHES;
    }
    get value() {
        return this.props.record.data[this.props.name];
    }
    get customColor() {
        return this.props.record.data.mt_primary_color || "#4f46e5";
    }
    select(value) {
        this.props.record.update({ [this.props.name]: value });
    }
    onCustom(ev) {
        this.props.record.update({ [this.props.name]: "custom", mt_primary_color: ev.target.value });
    }
}
registry.category("fields").add("mt_swatches", {
    component: MtSwatchField,
    displayName: _t("Theme swatches"),
    supportedTypes: ["selection"],
});
// Backward compatibility with views written for the previous version.
registry.category("fields").add("modern_theme_preset_picker", {
    component: MtSwatchField,
    supportedTypes: ["selection"],
});

/** Sidebar style as three illustrated cards. */
export class MtSidebarCardsField extends MtSegmentedField {
    static template = "modern_theme.SidebarCardsField";
}
registry.category("fields").add("mt_sidebar_cards", {
    component: MtSidebarCardsField,
    displayName: _t("Sidebar style cards"),
    supportedTypes: ["selection"],
});

// ---------------------------------------------------------------------------
// Live preview + tools (view widget)
// ---------------------------------------------------------------------------
export class MtThemePreview extends Component {
    static template = "modern_theme.ThemePreview";
    static props = { ...standardWidgetProps };

    setup() {
        this.theme = useService("mt_theme");
        this.notification = useService("notification");
        this.fileInput = useRef("file");
        // Every change in the form is shown at once on the whole interface.
        useEffect(
            (...vals) => {
                const values = Object.fromEntries(KEYS.map((k, i) => [k, vals[i]]));
                if (values.preset) {
                    this.theme.preview(values);
                }
            },
            () => KEYS.map((k) => this.props.record.data[`mt_${k}`])
        );
        onWillUnmount(() => this.theme.cancelPreview());
    }

    get values() {
        return Object.fromEntries(KEYS.map((k) => [k, this.props.record.data[`mt_${k}`]]));
    }

    resetDefaults() {
        this.props.record.update(Object.fromEntries(KEYS.map((k) => [`mt_${k}`, FACTORY_DEFAULTS[k]])));
        this.notification.add(_t("Factory defaults loaded. Save to apply them for everyone."), { type: "info" });
    }

    exportJson() {
        const data = { modern_theme: 1, values: this.values };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "modern-theme-preset.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    importJson() {
        this.fileInput.el?.click();
    }

    async onFile(ev) {
        const file = ev.target.files?.[0];
        ev.target.value = "";
        if (!file) {
            return;
        }
        try {
            const parsed = JSON.parse(await file.text());
            const source = parsed.values || parsed;
            const changes = {};
            for (const key of KEYS) {
                if (!(key in source)) {
                    continue;
                }
                const field = this.props.record.fields[`mt_${key}`];
                const value = source[key];
                if (field?.type === "selection" && !field.selection.some(([v]) => v === value)) {
                    continue; // ignore unknown values instead of failing
                }
                if (field?.type === "char" && value && !/^#[0-9a-f]{6}$/i.test(value)) {
                    continue;
                }
                changes[`mt_${key}`] = field?.type === "boolean" ? Boolean(value) : value;
            }
            await this.props.record.update(changes);
            this.notification.add(_t("Preset imported. Save to apply it for everyone."), { type: "success" });
        } catch {
            this.notification.add(_t("This file is not a Modern Theme preset."), { type: "danger" });
        }
    }
}
registry.category("view_widgets").add("mt_theme_preview", { component: MtThemePreview });
