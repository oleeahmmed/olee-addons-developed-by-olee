import { Component, onWillStart, useRef, useState, useExternalListener } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { TagChips } from "./ui";

/** many2many_tags-like input for crm.tag: search, pick, or create on the fly. */
export class TagInput extends Component {
    static template = "crm_modern.TagInput";
    static components = { TagChips };
    static props = {
        value: Array, // [{ id, name, color }]
        onChange: Function, // receives the new array
        id: { type: String, optional: true },
        placeholder: { type: String, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.root = useRef("root");
        this.state = useState({ q: "", open: false, active: 0, all: [] });
        onWillStart(() => this.loadTags());
        useExternalListener(document, "mousedown", (ev) => {
            if (!this.root.el?.contains(ev.target)) {
                this.state.open = false;
            }
        });
    }

    async loadTags() {
        this.state.all = await this.orm.searchRead("crm.tag", [], ["name", "color"], { order: "name" });
    }

    get options() {
        const term = this.state.q.trim().toLowerCase();
        const taken = new Set(this.props.value.map((t) => t.id));
        const matches = this.state.all
            .filter((t) => !taken.has(t.id) && (!term || t.name.toLowerCase().includes(term)))
            .slice(0, 8)
            .map((t) => ({ ...t, kind: "tag" }));
        const exact = this.state.all.some((t) => t.name.toLowerCase() === term);
        if (term && !exact) {
            matches.push({ id: "__create", name: this.state.q.trim(), color: 0, kind: "create" });
        }
        return matches;
    }

    async pick(index) {
        const opt = this.options[index];
        if (!opt) {
            return;
        }
        let tag = opt;
        if (opt.kind === "create") {
            const [id] = await this.orm.create("crm.tag", [{ name: opt.name }]);
            [tag] = await this.orm.read("crm.tag", [id], ["name", "color"]);
            this.state.all.push(tag);
        }
        this.props.onChange([...this.props.value, { id: tag.id, name: tag.name, color: tag.color }]);
        this.state.q = "";
        this.state.active = 0;
    }

    onInput() {
        this.state.open = true;
        this.state.active = 0;
    }

    noop() {}

    remove(id) {
        this.props.onChange(this.props.value.filter((t) => t.id !== id));
    }

    onKeydown(ev) {
        const n = this.options.length;
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            this.state.open = true;
            this.state.active = Math.min(this.state.active + 1, n - 1);
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            this.state.active = Math.max(this.state.active - 1, 0);
        } else if (ev.key === "Enter" && this.state.open && n) {
            ev.preventDefault();
            this.pick(this.state.active);
        } else if (ev.key === "Escape") {
            this.state.open = false;
        } else if (ev.key === "Backspace" && !this.state.q && this.props.value.length) {
            this.props.onChange(this.props.value.slice(0, -1));
        }
    }

    focusInput() {
        this.root.el?.querySelector("input")?.focus();
    }
}
