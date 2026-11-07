import { Component, onWillDestroy, onWillStart, onWillUnmount, useExternalListener, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { deserializeDateTime, serializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OrSelectCard } from "../or_select_card";

/**
 * Smart drawer: the right-side drawer of Modern CRM (same .o_or_sheet / .or-* classes),
 * built from a short description instead of a hand-written template, for every simple
 * record of every app (a tag, a payment method, a warehouse, a work centre…).
 *
 *   drawerForms.add("product.tag", {
 *       title: _t("Product tag"), newTitle: _t("New product tag"),
 *       subtitle: _t("Labels to sort and find products."),
 *       fields: ["name", { name: "color", widget: "color" }],
 *   });
 *
 * Labels, help, selection values, relations and required come from the model itself
 * (fields_get), so a field the user may not see, or a module that is not installed,
 * simply drops out. Records are read and written with the ORM under the user's rights;
 * Odoo's full form stays one click away ("Open full form" / "More fields").
 *
 * Field entries:  "name"  |  { name, label, hint, placeholder, widget, domain, required,
 *                              visible: (values) => bool, min, step, rows }
 *                 [field, field]          two fields side by side
 *                 { section, icon, text } a section heading
 * Widgets: color, toggle, chips (selection / many2many as buttons), cards (selection as
 * cards), textarea, names (a one2many of names, e.g. attribute values), date, datetime.
 *
 * kanban: true also opens the drawer from the model's kanban views (off by default: many
 * kanbans are dashboards, e.g. journals or operation types).
 *
 * A key "<model>:<variant>" is used when the list's action context carries
 * {'modern_drawer': '<variant>'} (e.g. product.template:medicine for the pharmacy).
 */
export const drawerForms = registry.category("modern_theme.drawer_forms");

/** Add fields to a description registered by another module. */
export function extendDrawerForm(key, fields, { after } = {}) {
    if (!drawerForms.contains(key)) {
        return;
    }
    const spec = drawerForms.get(key);
    const list = [...(spec.fields || [])];
    const at = after ? list.findIndex((f) => fieldName(f) === after) : -1;
    list.splice(at >= 0 ? at + 1 : list.length, 0, ...fields);
    drawerForms.add(key, { ...spec, fields: list }, { force: true });
}

function fieldName(entry) {
    return typeof entry === "string" ? entry : entry?.name;
}

/** The description for a model in a given action context, or null. */
export function findDrawerForm(resModel, context = {}) {
    if (!resModel) {
        return null;
    }
    const variant = context?.modern_drawer;
    if (variant) {
        const key = `${resModel}:${variant}`;
        return drawerForms.contains(key) ? { key, ...drawerForms.get(key) } : null;
    }
    return drawerForms.contains(resModel) ? { key: resModel, ...drawerForms.get(resModel) } : null;
}

/** Open the drawer (or the description's own component); resolves when it closes. */
export function openSmartDrawer(dialogService, spec, { resModel, resId = false, context = {}, onSaved } = {}) {
    const Comp = spec.component || SmartDrawer;
    const props = spec.component
        ? { resId: resId || false, context, onSaved }
        : { spec, resModel, resId: resId || false, context, onSaved };
    return new Promise((resolve) => dialogService.add(Comp, props, { onClose: resolve }));
}

const COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const SUPPORTED = new Set([
    "char", "text", "html", "integer", "float", "monetary", "boolean", "selection",
    "many2one", "many2many", "one2many", "date", "datetime",
]);

function htmlToText(html) {
    if (!html) {
        return "";
    }
    const box = document.createElement("div");
    box.innerHTML = html;
    return (box.innerText || box.textContent || "").trim();
}

function textToHtml(text) {
    const t = (text || "").trim();
    if (!t) {
        return false;
    }
    const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<p>${esc.replace(/\n/g, "<br/>")}</p>`;
}

function toLocalInput(value) {
    if (!value) {
        return "";
    }
    return deserializeDateTime(value).toFormat("yyyy-MM-dd'T'HH:mm");
}

function fromLocalInput(value) {
    if (!value) {
        return false;
    }
    return serializeDateTime(luxon.DateTime.fromISO(value));
}

// ------------------------------------------------------------------ shell

/** Right-side sheet: rail (+ new, close), title, subtitle, actions, fields, save pill. */
export class MtDrawer extends Component {
    static template = "modern_theme.MtDrawer";
    static components = { Dialog };
    static props = {
        title: String,
        subtitle: { type: String, optional: true },
        close: Function,
        onNew: { type: Function, optional: true },
        newLabel: { type: String, optional: true },
        onOpenFull: { type: Function, optional: true }, // rail button: Odoo's full form
        slots: { type: Object, optional: true },
    };

    setup() {
        document.body.classList.add("or-sheet-open");
        onWillDestroy(() => document.body.classList.remove("or-sheet-open"));
    }
    get newLabel() {
        return this.props.newLabel || _t("New record");
    }
    onNew(ev) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        if (this.props.onNew) {
            this.props.onNew();
            return;
        }
        this.props.close();
    }
    close(ev) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        this.props.close();
    }
    openFull(ev) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        this.props.onOpenFull?.();
    }
    get fullLabel() {
        return _t("Open full form");
    }
}

// ------------------------------------------------------------------ many2one picker

/** Search-as-you-type picker (name_search, so it finds what Odoo's many2one finds). */
export class MtPicker extends Component {
    static template = "modern_theme.MtPicker";
    static props = {
        resModel: String,
        domain: { type: Array, optional: true },
        context: { type: Object, optional: true },
        placeholder: { type: String, optional: true },
        value: { type: [Array, Boolean], optional: true }, // [id, name]
        onSelect: Function, // ([id, name] | false) => void
        allowEmpty: { type: Boolean, optional: true },
        canCreate: { type: Boolean, optional: true },
        exclude: { type: Array, optional: true }, // ids not to offer (many2many already picked)
        disabled: { type: Boolean, optional: true },
        id: { type: String, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ q: "", editing: false, open: false, results: [], active: 0, loading: false });
        this.timer = null;
        onWillUnmount(() => clearTimeout(this.timer));
    }
    get label() {
        return this.props.value ? this.props.value[1] : "";
    }
    get options() {
        const exclude = new Set(this.props.exclude || []);
        const rows = this.state.results.filter((r) => !exclude.has(r[0]));
        const q = this.state.q.trim();
        if (this.props.canCreate && q && !rows.some((r) => r[1].toLowerCase() === q.toLowerCase())) {
            rows.push([0, _t("Create “%s”", q)]);
        }
        return rows;
    }
    onFocus() {
        if (this.props.disabled) {
            return;
        }
        Object.assign(this.state, { editing: true, q: "", open: true });
        this.search();
    }
    onBlur() {
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
            context: this.props.context || {},
        });
        Object.assign(this.state, { results, active: 0, loading: false });
    }
    noop() {}
    async pick(result) {
        let value = result;
        if (!result[0]) {
            const name = this.state.q.trim();
            const [created] = await this.orm.call(this.props.resModel, "name_create", [name], {
                context: this.props.context || {},
            });
            value = [created, name];
        }
        this.props.onSelect(value);
        Object.assign(this.state, { q: "", open: false, editing: false });
        document.activeElement?.blur?.();
    }
    clear(ev) {
        ev.stopPropagation();
        this.props.onSelect(false);
    }
    onKeydown(ev) {
        const n = this.options.length;
        if (ev.key === "ArrowDown" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active + 1) % n;
        } else if (ev.key === "ArrowUp" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active - 1 + n) % n;
        } else if (ev.key === "Enter" && this.state.open && n) {
            ev.preventDefault();
            this.pick(this.options[this.state.active]);
        } else if (ev.key === "Escape") {
            this.state.open = false;
        }
    }
}

// ------------------------------------------------------------------ the form

/**
 * Loads, shows and saves the fields of a description. Shared by the drawer and by the
 * single-record page (company settings such as the SMS gateway).
 */
export class SmartFormBase extends Component {
    static components = { MtDrawer, MtPicker, OrSelectCard };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({
            ready: false,
            values: {},
            names: {}, // one2many "names": [{ id, name }]
            error: null,
            saving: false,
            fresh: false,
            canSave: true,
            displayName: "",
            choices: {},
            saved: false,
            colorOpen: null, // name of the colour field whose palette is open
        });
        this.meta = {};
        onWillStart(() => this.load());
        useExternalListener(document, "mousedown", (ev) => {
            if (this.state.colorOpen && !ev.target.closest?.(".mt-sd-color")) {
                this.state.colorOpen = null;
            }
        });
    }

    // ---- description
    get spec() {
        return this.props.spec;
    }
    get resModel() {
        return this.props.resModel;
    }
    get context() {
        return this.props.context || {};
    }
    get initialResId() {
        return this.props.resId || false;
    }
    get isEdit() {
        return Boolean(this.initialResId) && !this.state.fresh;
    }
    get recordId() {
        return this.isEdit ? this.initialResId : false;
    }
    /** Flat list of field entries ({ name, ... }) the model really has. */
    get entries() {
        const out = [];
        const walk = (list) => {
            for (const entry of list || []) {
                if (Array.isArray(entry)) {
                    walk(entry);
                } else if (entry && !entry.section) {
                    const e = typeof entry === "string" ? { name: entry } : entry;
                    if (this.meta[e.name]) {
                        out.push(e);
                    }
                }
            }
        };
        walk(this.spec.fields);
        return out;
    }
    entryOf(name) {
        return this.entries.find((e) => e.name === name);
    }
    /**
     * Rows to render: single fields and pairs, hidden fields left out. Small fields
     * (switches, numbers, dates, colours) that follow each other share a row, so a
     * drawer stays short. Section markers of older descriptions are ignored: a drawer
     * shows labels and fields only.
     */
    get rows() {
        const v = this.state.values;
        const show = (e) => {
            const entry = typeof e === "string" ? { name: e } : e;
            if (!entry || entry.section || !this.meta[entry.name]) {
                return null;
            }
            if (entry.visible && !entry.visible(v, this)) {
                return null;
            }
            const cell = this.fieldView(entry);
            // buttons for a many2many with nothing to pick: leave the field out
            if (cell.widget === "chips" && cell.meta.type === "many2many" && !this.choicesOf(cell).length) {
                return null;
            }
            return cell;
        };
        const kind = (cell) => {
            if (cell.full) {
                return null;
            }
            if (cell.widget === "toggle") {
                return "switch";
            }
            return ["number", "date", "color", "hexcolor"].includes(cell.widget) || cell.short ? "small" : null;
        };
        const singles = [];
        for (const entry of this.spec.fields || []) {
            if (Array.isArray(entry)) {
                const cells = entry.map(show).filter(Boolean);
                if (cells.length === 1) {
                    singles.push({ cell: cells[0], kind: kind(cells[0]) });
                } else if (cells.length) {
                    singles.push({ pair: cells });
                }
            } else {
                const cell = show(entry);
                if (cell) {
                    singles.push({ cell, kind: kind(cell) });
                }
            }
        }
        const rows = [];
        for (let i = 0; i < singles.length; i++) {
            const a = singles[i];
            if (a.pair) {
                rows.push({ type: "pair", key: a.pair.map((c) => c.name).join("_"), fields: a.pair });
                continue;
            }
            const b = singles[i + 1];
            if (a.kind && b && !b.pair && b.kind === a.kind) {
                rows.push({ type: "pair", key: `${a.cell.name}_${b.cell.name}`, fields: [a.cell, b.cell] });
                i++;
            } else {
                rows.push({ type: "field", key: a.cell.name, field: a.cell });
            }
        }
        return rows;
    }
    fieldView(entry) {
        const m = this.meta[entry.name];
        let widget = entry.widget;
        if (!widget) {
            widget = {
                boolean: "toggle",
                text: "textarea",
                html: "textarea",
                integer: "number",
                float: "number",
                monetary: "number",
                // a few short choices as buttons, longer ones as cards
                selection:
                    (m.selection || []).length <= 4 && (m.selection || []).every(([, label]) => String(label).length <= 24)
                        ? "chips"
                        : "cards",
                many2one: "many2one",
                many2many: "tags",
                one2many: "names",
                date: "date",
                datetime: "datetime",
            }[m.type] || "char";
        }
        const readonly = !this.state.canSave || entry.readonly || m.readonly;
        const placeholder =
            entry.placeholder ||
            { tags: _t("Add…"), cards: _t("Pick one"), names: _t("Type and press Enter") }[widget] ||
            "";
        return {
            ...entry,
            placeholder,
            meta: m,
            widget,
            id: `mt_sd_${entry.name}`,
            label: entry.label || m.string,
            // the drawer shows a label and the field, nothing more (no help lines)
            hint: "",
            required: entry.required || m.required,
            readonly,
            options: (m.selection || []).map(([id, title]) => ({ id, title })),
        };
    }
    helpOf(m) {
        const help = (m.help || "").trim();
        return help && help.length <= 180 ? help : "";
    }
    domainOf(f) {
        if (typeof f.domain === "function") {
            return f.domain(this.state.values, this);
        }
        if (Array.isArray(f.domain)) {
            return f.domain;
        }
        if (f.name === "parent_id" && f.meta.relation === this.resModel && this.recordId) {
            return [["id", "!=", this.recordId]];
        }
        return [];
    }
    get colors() {
        return COLORS;
    }
    get title() {
        if (this.isEdit) {
            return this.state.displayName || String(this.spec.title || "");
        }
        return String(this.spec.newTitle || this.spec.title || _t("New"));
    }
    get subtitle() {
        const s = this.spec.subtitle;
        return s ? String(typeof s === "function" ? s(this) : s) : "";
    }
    get newLabel() {
        return String(this.spec.newTitle || _t("New"));
    }

    // ---- load
    async load() {
        const names = [];
        const walk = (list) => {
            for (const entry of list || []) {
                if (Array.isArray(entry)) {
                    walk(entry);
                } else if (entry && !entry.section) {
                    names.push(fieldName(entry));
                }
            }
        };
        walk(this.spec.fields);
        const meta = await this.orm.call(this.resModel, "fields_get", [names], {
            attributes: ["string", "type", "help", "selection", "relation", "required", "readonly", "relation_field"],
        });
        for (const [name, m] of Object.entries(meta)) {
            if (SUPPORTED.has(m.type)) {
                this.meta[name] = m;
            }
        }
        const resId = this.initialResId;
        this.state.canSave = this.spec.readonly
            ? false
            : await user.checkAccessRight(this.resModel, resId ? "write" : "create").catch(() => false);
        await this.loadChoices();
        if (resId) {
            await this.loadRecord(resId);
        } else {
            await this.loadDefaults();
        }
        this.state.ready = true;
    }
    /** Buttons for many2many fields shown as chips: the first 40 records of the relation. */
    async loadChoices() {
        const choices = {};
        for (const e of this.entries) {
            const m = this.meta[e.name];
            if (m.type === "many2many" && e.widget === "chips") {
                const recs = await this.orm
                    .searchRead(m.relation, e.domain && Array.isArray(e.domain) ? e.domain : [], ["display_name"], { limit: 40 })
                    .catch(() => []);
                choices[e.name] = recs.map((r) => ({ id: r.id, name: r.display_name }));
            }
        }
        this.state.choices = choices;
    }
    async loadRecord(resId) {
        const fnames = Object.keys(this.meta);
        const [rec] = await this.orm.read(this.resModel, [resId], [...fnames, "display_name"], {
            context: this.context,
        });
        if (!rec) {
            return;
        }
        this.state.displayName = rec.display_name || "";
        await this.applyValues(rec);
    }
    async loadDefaults() {
        const fnames = Object.keys(this.meta);
        const defaults = await this.orm.call(this.resModel, "default_get", [fnames], { context: this.context });
        await this.applyValues(defaults, true);
    }
    /** Turn read / default_get values into the form's values. */
    async applyValues(raw, fromDefaults = false) {
        const values = {};
        const names = {};
        for (const [name, m] of Object.entries(this.meta)) {
            let v = raw[name];
            switch (m.type) {
                case "many2one":
                    if (Array.isArray(v)) {
                        values[name] = v;
                    } else if (v) {
                        const [r] = await this.orm.read(m.relation, [v], ["display_name"]).catch(() => [null]);
                        values[name] = r ? [r.id, r.display_name] : false;
                    } else {
                        values[name] = false;
                    }
                    break;
                case "many2many":
                case "one2many": {
                    let ids = [];
                    for (const item of v || []) {
                        if (typeof item === "number") {
                            ids.push(item);
                        } else if (Array.isArray(item) && item[0] === 6) {
                            ids = [...item[2]];
                        } else if (Array.isArray(item) && item[0] === 4) {
                            ids.push(item[1]);
                        }
                    }
                    // one2many "names": the lines' own name (an attribute value is "Red", not "Color: Red")
                    const nameField = m.type === "one2many" ? this.entryOf(name)?.nameField || "name" : "display_name";
                    const recs = ids.length
                        ? await this.orm.read(m.relation, ids, [nameField]).catch(() => [])
                        : [];
                    const byId = Object.fromEntries(recs.map((r) => [r.id, r[nameField]]));
                    const rows = ids.filter((id) => id in byId).map((id) => ({ id, name: byId[id] }));
                    if (m.type === "one2many") {
                        names[name] = rows;
                        values[name] = null;
                    } else {
                        values[name] = rows;
                    }
                    break;
                }
                case "boolean":
                    values[name] = Boolean(v);
                    break;
                case "integer":
                case "float":
                case "monetary":
                    values[name] = v === false || v === undefined || v === null ? "" : v;
                    break;
                case "html":
                    values[name] = htmlToText(v);
                    break;
                case "datetime":
                    values[name] = toLocalInput(v);
                    break;
                default:
                    values[name] = v === false || v === undefined || v === null ? "" : v;
            }
        }
        // the description's own defaults (new records only)
        if (fromDefaults && this.spec.defaults) {
            const extra = typeof this.spec.defaults === "function" ? this.spec.defaults(this) : this.spec.defaults;
            Object.assign(values, extra);
        }
        this.state.values = values;
        this.state.names = names;
    }

    // ---- edit helpers (templates cannot use arrow-function blocks)
    set(name, value) {
        this.state.values[name] = value;
        this.state.error = null;
        const m = this.meta[name];
        if (m && ["selection", "many2one", "boolean"].includes(m.type) && this.spec.onchange !== false) {
            this.runOnchange(name);
        }
    }
    /**
     * Odoo's own onchange for the field just changed (e.g. a wallet provider switches on
     * "Ask the TrxID"). Only plain fields are sent and applied; never blocks the form.
     */
    async runOnchange(name) {
        if (!this.state.canSave) {
            return;
        }
        const values = {};
        const spec = {};
        for (const [fname, m] of Object.entries(this.meta)) {
            const v = this.state.values[fname];
            if (m.type === "one2many" || m.type === "many2many") {
                continue;
            }
            spec[fname] = m.type === "many2one" ? { fields: { display_name: {} } } : {};
            if (m.type === "many2one") {
                values[fname] = Array.isArray(v) ? v[0] : false;
            } else if (m.type === "html") {
                values[fname] = textToHtml(v);
            } else if (m.type === "datetime") {
                values[fname] = fromLocalInput(v);
            } else if (["integer", "float", "monetary"].includes(m.type)) {
                values[fname] = v === "" ? 0 : Number(v) || 0;
            } else {
                values[fname] = v === "" ? false : v;
            }
        }
        const ids = this.recordId ? [this.recordId] : [];
        let result;
        try {
            result = await this.orm.call(this.resModel, "onchange", [ids, values, [name], spec], {
                context: this.context,
            });
        } catch (e) {
            console.warn("smart drawer: onchange failed", e);
            return;
        }
        for (const [fname, v] of Object.entries(result?.value || {})) {
            const m = this.meta[fname];
            if (!m || fname === name || m.type === "one2many" || m.type === "many2many") {
                continue;
            }
            if (m.type === "many2one") {
                this.state.values[fname] = v ? [v.id, v.display_name] : false;
            } else if (m.type === "html") {
                this.state.values[fname] = htmlToText(v);
            } else if (m.type === "datetime") {
                this.state.values[fname] = toLocalInput(v);
            } else if (m.type === "boolean") {
                this.state.values[fname] = Boolean(v);
            } else {
                this.state.values[fname] = v === false || v === null ? "" : v;
            }
        }
        if (result?.warning?.message) {
            this.state.error = result.warning.message;
        }
    }
    onInput(name, ev) {
        this.set(name, ev.target.value);
    }
    toggle(name) {
        this.set(name, !this.state.values[name]);
    }
    toggleColors(name) {
        this.state.colorOpen = this.state.colorOpen === name ? null : name;
    }
    pickColor(name, color) {
        this.set(name, color);
        this.state.colorOpen = null;
    }
    hasTag(name, id) {
        return (this.state.values[name] || []).some((r) => r.id === id);
    }
    tagIds(name) {
        return (this.state.values[name] || []).map((r) => r.id);
    }
    addTag(name, value) {
        if (!value) {
            return;
        }
        const rows = this.state.values[name] || [];
        if (!rows.some((r) => r.id === value[0])) {
            this.state.values[name] = [...rows, { id: value[0], name: value[1] }];
        }
    }
    removeTag(name, id) {
        this.state.values[name] = (this.state.values[name] || []).filter((r) => r.id !== id);
    }
    toggleChoice(name, id, label) {
        if (this.hasTag(name, id)) {
            this.removeTag(name, id);
        } else {
            this.addTag(name, [id, label]);
        }
    }
    addName(name, ev) {
        if (ev.key !== "Enter" && ev.key !== ",") {
            return;
        }
        ev.preventDefault();
        const text = ev.target.value.trim();
        if (!text) {
            return;
        }
        const rows = this.state.names[name] || [];
        if (!rows.some((r) => r.name.toLowerCase() === text.toLowerCase())) {
            this.state.names[name] = [...rows, { id: false, name: text }];
        }
        ev.target.value = "";
    }
    removeName(name, index) {
        const rows = [...(this.state.names[name] || [])];
        rows.splice(index, 1);
        this.state.names[name] = rows;
    }
    moveName(name, index, step) {
        const rows = [...(this.state.names[name] || [])];
        const to = index + step;
        if (to < 0 || to >= rows.length) {
            return;
        }
        [rows[index], rows[to]] = [rows[to], rows[index]];
        this.state.names[name] = rows;
    }
    /** Static choices for a many2many shown as buttons: { name: [{ id, name }] } */
    choicesOf(f) {
        return this.state.choices?.[f.name] || [];
    }

    // ---- save
    validate() {
        for (const e of this.entries) {
            const f = this.fieldView(e);
            if (f.readonly || (e.visible && !e.visible(this.state.values, this))) {
                continue;
            }
            const v = this.state.values[e.name];
            const empty =
                v === "" || v === false || v === null || v === undefined || (Array.isArray(v) && !v.length && f.meta.type === "many2many");
            if (f.required && empty && f.meta.type !== "boolean" && f.meta.type !== "one2many") {
                return _t("Fill in “%s”.", f.label);
            }
        }
        return this.spec.validate ? this.spec.validate(this.state.values, this) : null;
    }
    toValues() {
        const vals = {};
        for (const e of this.entries) {
            const m = this.meta[e.name];
            if (m.readonly || e.readonly) {
                continue;
            }
            const v = this.state.values[e.name];
            switch (m.type) {
                case "many2one":
                    vals[e.name] = Array.isArray(v) ? v[0] : false;
                    break;
                case "many2many":
                    vals[e.name] = [[6, 0, (v || []).map((r) => r.id)]];
                    break;
                case "one2many": {
                    const rows = this.state.names[e.name] || [];
                    const nameField = e.nameField || "name";
                    const cmds = [];
                    const kept = new Set(rows.filter((r) => r.id).map((r) => r.id));
                    for (const id of this.originalNames?.[e.name] || []) {
                        if (!kept.has(id)) {
                            cmds.push([2, id]);
                        }
                    }
                    rows.forEach((r, i) => {
                        const line = e.sequence === false ? {} : { sequence: (i + 1) * 10 };
                        cmds.push(r.id ? [1, r.id, line] : [0, 0, { [nameField]: r.name, ...line }]);
                    });
                    vals[e.name] = cmds;
                    break;
                }
                case "boolean":
                    vals[e.name] = Boolean(v);
                    break;
                case "integer":
                    vals[e.name] = v === "" ? 0 : parseInt(v, 10) || 0;
                    break;
                case "float":
                case "monetary":
                    vals[e.name] = v === "" ? 0 : Number(v) || 0;
                    break;
                case "html":
                    vals[e.name] = textToHtml(v);
                    break;
                case "datetime":
                    vals[e.name] = fromLocalInput(v);
                    break;
                case "char":
                case "text":
                    vals[e.name] = (v || "").trim() ? v.trim() : false;
                    break;
                default:
                    vals[e.name] = v === "" ? false : v;
            }
        }
        if (this.spec.prepare) {
            this.spec.prepare(vals, this.state.values, this);
        }
        return vals;
    }
    rememberNames() {
        this.originalNames = Object.fromEntries(
            Object.entries(this.state.names).map(([k, rows]) => [k, rows.filter((r) => r.id).map((r) => r.id)])
        );
    }
    async save() {
        if (!this.state.canSave || this.state.saving) {
            return;
        }
        const error = this.validate();
        if (error) {
            this.state.error = error;
            return;
        }
        Object.assign(this.state, { error: null, saving: true });
        try {
            const vals = this.toValues();
            let id = this.recordId;
            if (id) {
                await this.orm.write(this.resModel, [id], vals, { context: this.context });
            } else {
                [id] = await this.orm.create(this.resModel, [vals], { context: this.context });
            }
            this.props.onSaved?.(id);
            this.afterSave(id);
        } catch (e) {
            this.state.saving = false;
            throw e;
        }
    }
    afterSave() {}
    /** Odoo's own form as a full page, with what was typed so far as default values. */
    openFullForm() {
        const resId = this.recordId;
        const context = { ...this.context };
        if (!resId && this.state.canSave) {
            for (const [name, value] of Object.entries(this.toValues())) {
                const m = this.meta[name];
                if (value === false || m.type === "one2many" || (m.type === "many2many" && !value[0][2].length)) {
                    continue;
                }
                context[`default_${name}`] = value;
            }
        }
        this.props.close?.();
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: this.resModel,
            res_id: resId || undefined,
            views: [[this.spec.formViewId || false, "form"]],
            target: "current",
            context,
        });
    }
}

export class SmartDrawer extends SmartFormBase {
    static template = "modern_theme.SmartDrawer";
    static props = {
        close: Function,
        spec: Object,
        resModel: String,
        resId: { type: [Number, Boolean], optional: true },
        context: { type: Object, optional: true },
        onSaved: { type: Function, optional: true },
    };

    async load() {
        await super.load();
        this.rememberNames();
    }
    async resetForm() {
        Object.assign(this.state, { error: null, saving: false, fresh: true, displayName: "", ready: false });
        this.state.canSave = this.spec.readonly
            ? false
            : await user.checkAccessRight(this.resModel, "create").catch(() => false);
        await this.loadDefaults();
        this.rememberNames();
        this.state.ready = true;
    }
    afterSave() {
        this.props.close();
    }
}

/**
 * A single record as a page (company settings: SMS gateway, VAT registration…):
 * an ir.actions.client with tag "modern_theme.smart_form" and context
 * { smart_form: "<key>", smart_form_res_id: <id> | "company" } (kept on reload),
 * or params { key, res_model, res_id }. "company" means the current company.
 */
export class SmartFormPage extends SmartFormBase {
    static template = "modern_theme.SmartFormPage";
    static props = ["*"];

    get params() {
        const params = this.props.action?.params || {};
        const ctx = this.props.action?.context || {};
        return {
            key: params.key || ctx.smart_form,
            res_model: params.res_model || ctx.smart_form_model,
            res_id: params.res_id || ctx.smart_form_res_id || "company",
        };
    }
    get spec() {
        return drawerForms.get(this.params.key);
    }
    get resModel() {
        return this.params.res_model || this.params.key.split(":")[0];
    }
    get context() {
        return this.props.action?.context || {};
    }
    get initialResId() {
        const p = this.params;
        return p.res_id === "company" ? user.activeCompany?.id || user.context.allowed_company_ids?.[0] : p.res_id;
    }
    async load() {
        await super.load();
        this.rememberNames();
        this.state.saved = false;
    }
    async afterSave(id) {
        await this.loadRecord(id);
        this.rememberNames();
        Object.assign(this.state, { saving: false, saved: true });
        setTimeout(() => (this.state.saved = false), 2500);
    }
}

registry.category("actions").add("modern_theme.smart_form", SmartFormPage);

/**
 * Open the smart drawer from the server: a method returns
 *   { type: "ir.actions.client", tag: "modern_theme.drawer",
 *     params: { model, res_id, context, reload } }
 * (e.g. "+ New Shop" in the settings). reload: true reloads the page behind when it closes.
 */
registry.category("actions").add("modern_theme.drawer", (env, action) => {
    const p = action.params || {};
    const spec = findDrawerForm(p.model, p.context || {});
    if (!spec) {
        return;
    }
    openSmartDrawer(env.services.dialog, spec, {
        resModel: p.model,
        resId: p.res_id || false,
        context: p.context || {},
    }).then(() => {
        if (p.reload) {
            env.services.action.doAction({ type: "ir.actions.client", tag: "soft_reload" });
        }
    });
});
