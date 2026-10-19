import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

import { Component } from "@odoo/owl";

// Swatch colors are only used to draw the picker; the actual theme colors
// applied across the interface live in tokens.scss / tokens.dark.scss.
export const THEME_SWATCH_COLORS = {
    indigo: "#1e3fae",
    zinc: "#18181b",
    slate: "#0f172a",
    stone: "#1c1917",
    gray: "#111827",
    neutral: "#171717",
    red: "#dc2626",
    rose: "#e11d48",
    orange: "#f97316",
    green: "#16a34a",
    blue: "#2563eb",
    yellow: "#facc15",
    violet: "#7c3aed",
    teal: "#109384",
};

export class ThemePresetPickerField extends Component {
    static template = "modern_theme.ThemePresetPickerField";
    static props = { ...standardFieldProps };

    get options() {
        return Array.from(this.props.record.fields[this.props.name].selection);
    }

    get value() {
        return this.props.record.data[this.props.name];
    }

    swatchColor(key) {
        return THEME_SWATCH_COLORS[key] || "#18181b";
    }

    async select(key) {
        await this.props.record.update({ [this.props.name]: key });
    }
}

export const themePresetPickerField = {
    component: ThemePresetPickerField,
    displayName: _t("Theme Preset Picker"),
    supportedTypes: ["selection"],
};

registry.category("fields").add("modern_theme_preset_picker", themePresetPickerField);
