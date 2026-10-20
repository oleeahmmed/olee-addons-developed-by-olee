/** @odoo-module **/

import { Component, useRef, useState, useExternalListener } from "@odoo/owl";

/**
 * OmniRouters-style selectable card (the Create API Key "Group" field).
 * Shows the current option as a title/hint/badge card; opens a list to change it.
 */
export class OrSelectCard extends Component {
    static template = "modern_theme.OrSelectCard";
    static props = {
        value: { type: [String, Number, Boolean], optional: true },
        options: { type: Array },
        placeholder: { type: String, optional: true },
        emptyHint: { type: String, optional: true },
        allowEmpty: { type: Boolean, optional: true },
        onChange: Function,
        id: { type: String, optional: true },
    };

    setup() {
        this.root = useRef("root");
        this.state = useState({ open: false });
        useExternalListener(document, "mousedown", (ev) => {
            if (!this.root.el?.contains(ev.target)) {
                this.state.open = false;
            }
        });
    }

    get selected() {
        const raw = this.props.value;
        if (raw === "" || raw === false || raw === undefined || raw === null) {
            return null;
        }
        return this.props.options.find((opt) => opt.id == raw) || null;
    }

    get hasValue() {
        return Boolean(this.selected);
    }

    get title() {
        return this.selected?.title || this.props.placeholder || "Select…";
    }

    get hint() {
        return this.selected?.hint || (!this.selected && this.props.emptyHint) || "";
    }

    get badge() {
        return this.selected?.badge || "";
    }

    isActive(opt) {
        return this.selected && opt.id == this.props.value;
    }

    toggle() {
        this.state.open = !this.state.open;
    }

    pick(id) {
        this.props.onChange(id);
        this.state.open = false;
    }
}
