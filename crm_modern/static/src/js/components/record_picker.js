import { Component, onWillUnmount, useState } from "@odoo/owl";
import { useAutofocus, useService } from "@web/core/utils/hooks";

/**
 * Small search-as-you-type picker for any model (customers, products...).
 * Uses name_search so it matches exactly what Odoo's many2one fields find.
 */
export class RecordPicker extends Component {
    static template = "crm_modern.RecordPicker";
    static props = {
        resModel: String,
        domain: { type: Array, optional: true },
        placeholder: { type: String, optional: true },
        value: { type: [Array, Boolean], optional: true }, // [id, name]
        onSelect: Function, // ([id, name]) => void
        autofocus: { type: Boolean, optional: true },
        id: { type: String, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ q: "", editing: false, open: false, results: [], active: 0, loading: false });
        this.timer = null;
        if (this.props.autofocus) {
            useAutofocus({ refName: "input" });
        }
        onWillUnmount(() => clearTimeout(this.timer));
    }

    get label() {
        return this.props.value ? this.props.value[1] : "";
    }

    onFocus() {
        Object.assign(this.state, { editing: true, q: "", open: true });
        this.search();
    }
    onBlur() {
        // let a click on a result land first
        setTimeout(() => Object.assign(this.state, { open: false, editing: false }), 150);
    }
    onInput(ev) {
        this.state.q = ev.target.value;
        this.state.open = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.search(), 200);
    }
    async search() {
        this.state.loading = true;
        const results = await this.orm.call(this.props.resModel, "name_search", [], {
            name: this.state.q,
            domain: this.props.domain || [],
            limit: 8,
        });
        Object.assign(this.state, { results, active: 0, loading: false });
    }
    noop() {} // mousedown on a result: keep the focus so the click lands

    pick(result) {
        this.props.onSelect(result);
        Object.assign(this.state, { q: "", open: false, editing: false });
        document.activeElement?.blur?.();
    }
    onKeydown(ev) {
        const n = this.state.results.length;
        if (ev.key === "ArrowDown" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active + 1) % n;
        } else if (ev.key === "ArrowUp" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active - 1 + n) % n;
        } else if (ev.key === "Enter" && this.state.open && n) {
            ev.preventDefault();
            this.pick(this.state.results[this.state.active]);
        } else if (ev.key === "Escape") {
            this.state.open = false;
        }
    }
}
