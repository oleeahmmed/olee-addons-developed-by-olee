import { Component, onWillStart, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { PosMenu } from "@pos_modern/js/menu";
import { usePinApp } from "@pos_modern/js/app_context";
import { APP_XMLID } from "@pos_modern/js/pages";

const SIZE_RE = /size|সাইজ|মাপ/i;

/** Size × colour matrix of a style: tap a size to add it, sold-out sizes greyed out. */
export class ClMatrixDialog extends Component {
    static template = "pos_clothes.MatrixDialog";
    static components = { Dialog };
    static props = { title: String, variants: Array, money: Function, price: Function, qtyOf: Function,
        showStock: Boolean, lowStock: Number, onPick: Function, close: Function };

    setup() {
        this.state = useState({ added: {} });
    }
    get axes() {
        // columns: the "Size" attribute (or the last one); rows: the other attributes together
        const first = this.props.variants[0]?.attrs || [];
        if (!first.length) {
            return { colAttr: null };
        }
        const sizeIdx = first.findIndex((a) => SIZE_RE.test(a[0]));
        return { colIdx: sizeIdx >= 0 ? sizeIdx : first.length - 1, colAttr: first[sizeIdx >= 0 ? sizeIdx : first.length - 1][0] };
    }
    rowKey(v) {
        const { colIdx } = this.axes;
        return (v.attrs || []).filter((a, i) => i !== colIdx).map((a) => a[1]).join(" / ") || "—";
    }
    colKey(v) {
        const { colIdx } = this.axes;
        return v.attrs?.[colIdx]?.[1] || v.name;
    }
    get cols() {
        // in the attribute's own order (S, M, L, XL…)
        const { colIdx } = this.axes;
        const seen = new Map();
        for (const v of this.props.variants) {
            const a = v.attrs?.[colIdx];
            const k = this.colKey(v);
            if (!seen.has(k)) {
                seen.set(k, a ? [a[4] || 0, a[5] || 0] : [0, 0]);
            }
        }
        return [...seen.entries()].sort((x, y) => x[1][0] - y[1][0] || x[1][1] - y[1][1]).map((e) => e[0]);
    }
    get rows() {
        const out = [];
        for (const v of this.props.variants) {
            const k = this.rowKey(v);
            if (!out.includes(k)) {
                out.push(k);
            }
        }
        return out;
    }
    cell(row, col) {
        return this.props.variants.find((v) => this.rowKey(v) === row && this.colKey(v) === col);
    }
    soldOut(v) {
        return v.stock !== undefined && v.stock <= 0;
    }
    pick(v) {
        if (!v || this.soldOut(v)) {
            return;
        }
        this.props.onPick(v);
        this.state.added[v.id] = (this.state.added[v.id] || 0) + 1;
    }
    inCart(v) {
        return this.props.qtyOf(v) || 0;
    }
}

patch(PosMenu.prototype, {
    /** Clothing counter: one card per style (the variants are in its matrix). */
    get products() {
        const list = super.products;
        if (!this.features.clothes) {
            return list;
        }
        const seen = new Map();
        const out = [];
        for (const p of list) {
            if (!(p.variants > 1)) {
                out.push(p);
                continue;
            }
            let rep = seen.get(p.tmpl_id);
            if (!rep) {
                rep = { ...p, id: p.id, name: p.tmpl_name || p.name, _style: true, _variantIds: [], stock: undefined };
                seen.set(p.tmpl_id, rep);
                out.push(rep);
            }
            rep._variantIds.push(p.id);
            if (p.stock !== undefined) {
                rep.stock = (rep.stock || 0) + Math.max(0, p.stock);
                rep.uom = p.uom;
            }
        }
        return out;
    },
    qtyOf(p) {
        if (p._style) {
            return this.state.cart.filter((l) => p._variantIds.includes(l.id)).reduce((s, l) => s + l.qty, 0);
        }
        return super.qtyOf(p);
    },
    onProduct(p) {
        if (p._style) {
            const variants = (this.state.data.products || []).filter((v) => v.tmpl_id === p.tmpl_id);
            this.dialog.add(ClMatrixDialog, {
                title: p.name,
                variants,
                money: (v) => this.money(v),
                price: (v) => this.price(v),
                qtyOf: (v) => super.qtyOf(v),
                showStock: Boolean(this.features.show_stock),
                lowStock: this.features.low_stock || 0,
                onPick: (v) => this.addProduct(v),
            });
            return;
        }
        return super.onProduct(...arguments);
    },
});

/** Fast and slow sizes of every style. */
export class ClSizesPage extends Component {
    static template = "pos_clothes.Sizes";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        usePinApp(APP_XMLID);
        this.state = useState({ loading: true, data: null, days: 30, shops: [], configId: false });
        onWillStart(async () => {
            this.state.shops = await this.orm.searchRead("pos.config", [["cl_clothes", "=", true]], ["name"]);
            this.state.configId = this.state.shops[0]?.id || false;
            await this.load();
        });
    }
    async load() {
        if (!this.state.configId) {
            this.state.loading = false;
            return;
        }
        this.state.data = await this.orm.call("pos.config", "pos_cl_size_report", [[this.state.configId], this.state.days]);
        this.state.loading = false;
    }
    setDays(d) {
        this.state.days = d;
        this.load();
    }
    setShop(id) {
        this.state.configId = Number(id);
        this.load();
    }
    flagLabel(f) {
        return { out: _t("sold out"), fast: _t("running out"), slow: _t("not selling") }[f] || "";
    }
    flagClass(f) {
        return { out: "ps-tag--danger", fast: "ps-tag--warning", slow: "" }[f] || "";
    }
}

registry.category("actions").add("pos_clothes.sizes", ClSizesPage);
registry.category("pos_modern.menu_icons").add("pos_clothes.menu_size_report", "fa-th");
registry.category("pos_modern.menu_icons").add("pos_clothes.menu_styles", "fa-tag");
