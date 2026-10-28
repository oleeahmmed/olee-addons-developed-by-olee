import { Component, onWillDestroy, onWillStart, onWillUnmount, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { OrSelectCard } from "@modern_theme/js/or_select_card";

/**
 * The right-side drawer of Modern CRM (same component, same theme classes .o_or_sheet /
 * .or-*), for the simple records of the Point of Sale: a new product, a new customer, a
 * new shop, a PoS product category. Big records (an order, a session, a product's full
 * page, shop settings…) open as Odoo's own full page.
 * Values are read and written with the ORM, under the user's own access rights.
 */
export class FormDrawer extends Component {
    static template = "pos_modern.FormDrawer";
    static components = { Dialog };
    static props = {
        title: String,
        subtitle: { type: String, optional: true },
        close: Function,
        onNew: { type: Function, optional: true },
        newLabel: { type: String, optional: true },
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
}

/** Search-as-you-type picker (name_search, so it finds what Odoo's many2one finds). */
export class PsPicker extends Component {
    static template = "pos_modern.Picker";
    static props = {
        resModel: String,
        domain: { type: Array, optional: true },
        placeholder: { type: String, optional: true },
        value: { type: [Array, Boolean], optional: true }, // [id, name]
        onSelect: Function, // ([id, name] | false) => void
        allowEmpty: { type: Boolean, optional: true },
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
    onFocus() {
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
        });
        Object.assign(this.state, { results, active: 0, loading: false });
    }
    noop() {}
    pick(result) {
        this.props.onSelect(result);
        Object.assign(this.state, { q: "", open: false, editing: false });
        document.activeElement?.blur?.();
    }
    clear(ev) {
        ev.stopPropagation();
        this.props.onSelect(false);
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

/** Open a drawer component; resolves when it closes. */
export function openQuickDrawer(dialogService, DrawerComponent, props = {}) {
    return new Promise((resolve) => dialogService.add(DrawerComponent, props, { onClose: resolve }));
}

const toIds = (v) => (v || []).map((x) => (Array.isArray(x) ? x[0] : typeof x === "object" ? x.id : x));

/** Shared part of the drawers: load / new / save / open the full form. */
export class QuickDrawer extends Component {
    static components = { FormDrawer, OrSelectCard, PsPicker };
    static props = {
        close: Function,
        onSaved: { type: Function, optional: true },
        resId: { type: [Number, Boolean], optional: true },
        context: { type: Object, optional: true },
    };
    static resModel = "";
    /** fields with their empty value (many2one: false or [id, name], many2many: []) */
    static defaults = {};

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ ...this.emptyValues(), error: null, saving: false, fresh: false, choices: {} });
        onWillStart(() => this.load());
    }
    emptyValues() {
        const values = JSON.parse(JSON.stringify(this.constructor.defaults));
        for (const [key, value] of Object.entries(this.props.context || {})) {
            const name = key.startsWith("default_") ? key.slice(8) : null;
            if (name && name in values && !Array.isArray(value)) {
                values[name] = value;
            }
        }
        return values;
    }
    get isEdit() {
        return Boolean(this.props.resId) && !this.state.fresh;
    }
    get fieldNames() {
        return Object.keys(this.constructor.defaults);
    }
    async loadChoices() {}
    async load() {
        await this.loadChoices();
        if (!this.props.resId) {
            return;
        }
        const [rec] = await this.orm.read(this.constructor.resModel, [this.props.resId], this.fieldNames);
        if (rec) {
            const values = {};
            for (const name of this.fieldNames) {
                const empty = this.constructor.defaults[name];
                const v = rec[name];
                values[name] = Array.isArray(empty) ? toIds(v) : v === false && empty !== false ? empty : v;
            }
            Object.assign(this.state, values);
        }
    }
    toValues() {
        const vals = {};
        for (const name of this.fieldNames) {
            const empty = this.constructor.defaults[name];
            let v = this.state[name];
            if (Array.isArray(empty)) {
                v = [[6, 0, v]];
            } else if (Array.isArray(v)) {
                v = v[0];
            } else if (v === "" || v === null || v === undefined) {
                v = false;
            }
            vals[name] = v;
        }
        return vals;
    }
    validate() {
        return null;
    }
    resetForm() {
        Object.assign(this.state, this.emptyValues(), { error: null, saving: false, fresh: true });
    }
    toggle(name, id) {
        const ids = this.state[name];
        this.state[name] = ids.includes(id) ? ids.filter((n) => n !== id) : [...ids, id];
    }
    async save() {
        const error = this.validate();
        if (error) {
            this.state.error = error;
            return;
        }
        Object.assign(this.state, { error: null, saving: true });
        const model = this.constructor.resModel;
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write(model, [id], this.toValues());
            } else {
                [id] = await this.orm.create(model, [this.toValues()], { context: this.props.context || {} });
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            this.state.saving = false;
            throw e;
        }
    }
    /** Odoo's own form as a full page, with what was typed so far as default values. */
    openFullForm() {
        const resId = this.isEdit ? this.props.resId : false;
        const context = { ...(this.props.context || {}) };
        if (!resId) {
            for (const [name, value] of Object.entries(this.toValues())) {
                if (value !== false && !(Array.isArray(value) && !value[0][2].length)) {
                    context[`default_${name}`] = value;
                }
            }
        }
        this.props.close();
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: this.constructor.resModel,
            res_id: resId || undefined,
            views: [[false, "form"]],
            target: "current",
            context,
        });
    }
}

const COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** New product sold in the shop: name, price, PoS categories, barcode, reference. */
export class ProductDrawer extends QuickDrawer {
    static template = "pos_modern.ProductDrawer";
    static resModel = "product.template";
    static defaults = { name: "", list_price: 0, pos_categ_ids: [], barcode: "", default_code: "", available_in_pos: true };

    get title() {
        return _t("New product");
    }
    get subtitle() {
        return _t("Sold at the register right away. Taxes, variants, stock and pictures are on the product's page.");
    }
    get categories() {
        return this.state.choices.categories || [];
    }
    async loadChoices() {
        const categories = await this.orm.searchRead("pos.category", [], ["display_name", "color"], { limit: 80 });
        this.state.choices = { categories };
    }
    validate() {
        if (!this.state.name.trim()) {
            return _t("Give the product a name.");
        }
        if (Number(this.state.list_price) < 0) {
            return _t("The price cannot be negative.");
        }
        return null;
    }
    toValues() {
        const vals = super.toValues();
        vals.name = this.state.name.trim();
        vals.list_price = Number(this.state.list_price) || 0;
        vals.available_in_pos = true;
        return vals;
    }
}

/** New customer: name, person / company, email, phone, address. */
export class CustomerDrawer extends QuickDrawer {
    static template = "pos_modern.CustomerDrawer";
    static resModel = "res.partner";
    static defaults = { name: "", is_company: false, email: "", phone: "", street: "", city: "", vat: "" };

    get title() {
        return _t("New customer");
    }
    get subtitle() {
        return _t("Found at the register by name, phone or email. Everything else is on the contact's page.");
    }
    validate() {
        if (!this.state.name.trim()) {
            return _t("Give the customer a name.");
        }
        const email = this.state.email.trim();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return _t("This email address does not look right.");
        }
        return null;
    }
    toValues() {
        const vals = super.toValues();
        for (const key of ["name", "email", "phone", "street", "city", "vat"]) {
            vals[key] = (this.state[key] || "").trim() || false;
        }
        vals.is_company = Boolean(this.state.is_company);
        return vals;
    }
}

/** New shop (point of sale): its name; payment methods, receipts and the rest are in its settings. */
export class ShopDrawer extends QuickDrawer {
    static template = "pos_modern.ShopDrawer";
    static resModel = "pos.config";
    static defaults = { name: "" };

    get title() {
        return _t("New shop");
    }
    get subtitle() {
        return _t("A register of your shop or restaurant. Odoo sets the default payment methods; adjust them in its settings.");
    }
    validate() {
        return this.state.name.trim() ? null : _t("Give the shop a name.");
    }
    toValues() {
        return { name: this.state.name.trim() };
    }
}

/** PoS product category: name, parent, order, colour. */
export class CategoryDrawer extends QuickDrawer {
    static template = "pos_modern.CategoryDrawer";
    static resModel = "pos.category";
    static defaults = { name: "", parent_id: false, sequence: 10, color: 0 };

    get colors() {
        return COLORS;
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Category") : _t("New category");
    }
    get subtitle() {
        return _t("The tabs of the register's product screen.");
    }
    get parentDomain() {
        return this.isEdit ? [["id", "!=", this.props.resId]] : [];
    }
    validate() {
        return this.state.name.trim() ? null : _t("Give the category a name.");
    }
    toValues() {
        return {
            ...super.toValues(),
            name: this.state.name.trim(),
            sequence: Number(this.state.sequence) || 10,
            color: this.state.color || 0,
        };
    }
}
