import { Component, onMounted, useRef, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { printTemplate } from "./print";

/**
 * Counter tools shared by every shop: quantity pad (kg, metre, yard…), modifiers,
 * return / exchange of an earlier bill, barcode labels and a generic choice dialog.
 */

/** Quantity of a weighed / measured item. */
export class PsQtyDialog extends Component {
    static template = "pos_modern.QtyDialog";
    static components = { Dialog };
    static props = { title: String, unit: { type: String, optional: true }, price: { type: Number, optional: true },
        money: Function, onOk: Function, close: Function };

    setup() {
        this.state = useState({ value: "" });
        this.inputRef = useRef("input");
        onMounted(() => this.inputRef.el?.focus());
    }
    press(k) {
        if (k === "del") {
            this.state.value = this.state.value.slice(0, -1);
        } else if (k === "." && this.state.value.includes(".")) {
            return;
        } else {
            this.state.value += k;
        }
    }
    get qty() {
        return Math.round((Number(this.state.value) || 0) * 1000) / 1000;
    }
    ok() {
        if (this.qty > 0) {
            this.props.onOk(this.qty);
            this.props.close();
        }
    }
    onKey(ev) {
        if (ev.key === "Enter") {
            this.ok();
        }
    }
}

/** Extras / choices of a product ("less spicy", "extra cheese +40"…). */
export class PsModifierDialog extends Component {
    static template = "pos_modern.ModifierDialog";
    static components = { Dialog };
    static props = { product: Object, modifiers: Array, money: Function, onOk: Function, close: Function };

    setup() {
        this.state = useState({ picked: [] });
    }
    get groups() {
        const out = [];
        for (const m of this.props.modifiers) {
            let g = out.find((x) => x.name === m.group);
            if (!g) {
                g = { name: m.group, single: m.single, items: [] };
                out.push(g);
            }
            g.items.push(m);
        }
        return out;
    }
    isOn(m) {
        return this.state.picked.includes(m.id);
    }
    toggle(group, m) {
        if (this.isOn(m)) {
            this.state.picked = this.state.picked.filter((id) => id !== m.id);
            return;
        }
        if (group.single) {
            const ids = new Set(group.items.map((x) => x.id));
            this.state.picked = this.state.picked.filter((id) => !ids.has(id));
        }
        this.state.picked.push(m.id);
    }
    get extra() {
        return this.props.modifiers.filter((m) => this.isOn(m)).reduce((s, m) => s + m.price, 0);
    }
    ok() {
        const picked = this.props.modifiers.filter((m) => this.isOn(m));
        this.props.onOk(picked);
        this.props.close();
    }
}

/** Generic choice + count (unit / pack / size…). choices: [{ id, label, sub, factor, disabled }] */
export class PsChoiceDialog extends Component {
    static template = "pos_modern.ChoiceDialog";
    static components = { Dialog };
    static props = { title: String, subtitle: { type: String, optional: true }, choices: Array,
        withCount: { type: Boolean, optional: true }, onPick: Function, close: Function };

    setup() {
        this.state = useState({ id: this.props.choices.find((c) => !c.disabled)?.id, count: 1 });
    }
    step(d) {
        this.state.count = Math.max(1, (Number(this.state.count) || 1) + d);
    }
    pick(c) {
        if (c.disabled) {
            return;
        }
        this.state.id = c.id;
        if (!this.props.withCount) {
            this.ok();
        }
    }
    ok() {
        const c = this.props.choices.find((x) => x.id === this.state.id);
        if (c) {
            this.props.onPick(c, Number(this.state.count) || 1);
            this.props.close();
        }
    }
}

/** Return / exchange: scan the old receipt, choose what comes back. */
export class PsReturnDialog extends Component {
    static template = "pos_modern.ReturnDialog";
    static components = { Dialog };
    static props = { configId: Number, currencyId: Number, onAdd: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.inputRef = useRef("input");
        this.state = useState({ ref: "", order: null, qty: {}, error: "", loading: false });
        onMounted(() => this.inputRef.el?.focus());
    }
    money(v) {
        return formatCurrency(v || 0, this.props.currencyId);
    }
    async find() {
        if (!this.state.ref.trim()) {
            return;
        }
        this.state.loading = true;
        this.state.error = "";
        try {
            const order = await this.orm.call("pos.config", "pos_modern_find_order", [[this.props.configId], this.state.ref]);
            this.state.order = order;
            this.state.qty = {};
            if (!order) {
                this.state.error = _t("No paid bill found for “%s”.", this.state.ref);
            } else if (!order.lines.length) {
                this.state.error = _t("Everything of this bill was already returned.");
            }
        } finally {
            this.state.loading = false;
        }
    }
    onKey(ev) {
        if (ev.key === "Enter") {
            this.find();
        }
    }
    qtyOf(l) {
        return this.state.qty[l.id] || 0;
    }
    step(l, d) {
        this.state.qty[l.id] = Math.max(0, Math.min(l.left, this.qtyOf(l) + d));
    }
    all(l) {
        this.state.qty[l.id] = l.left;
    }
    get total() {
        return (this.state.order?.lines || []).reduce((s, l) => s + this.qtyOf(l) * l.price, 0);
    }
    add() {
        const lines = (this.state.order?.lines || []).filter((l) => this.qtyOf(l) > 0);
        if (!lines.length) {
            return;
        }
        this.props.onAdd(this.state.order, lines.map((l) => ({ line: l, qty: this.qtyOf(l) })));
        this.props.close();
    }
}

/** Barcode labels / hand tags of products (cart items, or searched). */
export class PsLabelsDialog extends Component {
    static template = "pos_modern.LabelsDialog";
    static components = { Dialog };
    static props = { configId: Number, currencyId: Number, products: Array, start: Array, size: String,
        shop: String, close: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ q: "", rows: this.props.start.map((r) => ({ ...r })), busy: false });
    }
    money(v) {
        return formatCurrency(v || 0, this.props.currencyId);
    }
    get matches() {
        const q = this.state.q.trim().toLowerCase();
        if (!q) {
            return [];
        }
        return this.props.products
            .filter((p) => p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q) || p.barcode === q)
            .slice(0, 8);
    }
    addRow(p) {
        const row = this.state.rows.find((r) => r.id === p.id);
        if (row) {
            row.copies += 1;
        } else {
            this.state.rows.push({ id: p.id, name: p.name, barcode: p.barcode, copies: 1 });
        }
        this.state.q = "";
    }
    stepRow(r, d) {
        r.copies = Math.max(1, r.copies + d);
    }
    remove(r) {
        this.state.rows = this.state.rows.filter((x) => x.id !== r.id);
    }
    get missing() {
        return this.state.rows.filter((r) => !r.barcode).length;
    }
    async generate() {
        const ids = this.state.rows.filter((r) => !r.barcode).map((r) => r.id);
        const rows = await this.orm.call("pos.config", "pos_modern_generate_barcodes", [[this.props.configId], ids]);
        for (const r of rows) {
            const row = this.state.rows.find((x) => x.id === r.id);
            const product = this.props.products.find((x) => x.id === r.id);
            if (row) {
                row.barcode = r.barcode;
            }
            if (product) {
                product.barcode = r.barcode;
            }
        }
    }
    async print() {
        if (!this.state.rows.length) {
            return;
        }
        this.state.busy = true;
        try {
            const data = await this.orm.call("pos.config", "pos_modern_label_rows", [
                [this.props.configId],
                this.state.rows.map((r) => r.id),
            ]);
            const labels = [];
            for (const r of this.state.rows) {
                const d = data.find((x) => x.id === r.id);
                for (let i = 0; i < r.copies && d; i++) {
                    labels.push(d);
                }
            }
            printTemplate(
                "pos_modern.Labels",
                {
                    labels,
                    shop: this.props.shop,
                    money: (v) => formatCurrency(v || 0, this.props.currencyId),
                    barcodeUrl: (code) => {
                        const type = /^\d{13}$/.test(code) ? "EAN13" : "Code128";
                        return `/report/barcode/?barcode_type=${type}&value=${encodeURIComponent(code)}&width=600&height=150&humanreadable=0&quiet=0`;
                    },
                },
                `label-${this.props.size}`
            );
        } finally {
            this.state.busy = false;
        }
    }
}
