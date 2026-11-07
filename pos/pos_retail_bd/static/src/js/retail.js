import { Component, onMounted, onWillStart, useRef, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { PosMenu } from "@pos_modern/js/menu";
import { usePinApp } from "@pos_modern/js/app_context";
import { APP_XMLID } from "@pos_modern/js/pages";
import { PsChoiceDialog } from "@pos_modern/js/counter/tools";

/** IMEI / serial number of a mobile, TV, fridge… (scan the box). */
export class RtSerialDialog extends Component {
    static template = "pos_retail_bd.SerialDialog";
    static components = { Dialog };
    static props = { product: Object, onOk: Function, close: Function };

    setup() {
        this.state = useState({ value: "" });
        this.inputRef = useRef("input");
        onMounted(() => this.inputRef.el?.focus());
    }
    ok() {
        const v = this.state.value.trim();
        if (v) {
            this.props.onOk(v);
            this.props.close();
        }
    }
    onKey(ev) {
        if (ev.key === "Enter") {
            this.ok();
        }
    }
}

/** Stock count of the shelf, or damaged items written off. */
export class RtStockPage extends Component {
    static template = "pos_retail_bd.Stock";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        usePinApp(APP_XMLID);
        this.state = useState({ loading: true, shops: [], configId: false, products: [], mode: "count", q: "", rows: [], note: "", busy: false });
        onWillStart(async () => {
            this.state.shops = await this.orm.searchRead("pos.config", [], ["name"]);
            this.state.configId = this.state.shops[0]?.id || false;
            await this.load();
        });
    }
    async load() {
        if (this.state.configId) {
            const data = await this.orm.call("pos.config", "pos_modern_menu", [this.state.configId]);
            this.state.products = (data.products || []).filter((p) => p.storable);
        }
        this.state.loading = false;
    }
    setShop(id) {
        this.state.configId = Number(id);
        this.state.rows = [];
        this.load();
    }
    get matches() {
        const q = this.state.q.trim().toLowerCase();
        return q ? this.state.products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode === q || (p.code || "").toLowerCase() === q).slice(0, 8) : [];
    }
    onKey(ev) {
        if (ev.key === "Enter" && this.matches.length === 1) {
            this.add(this.matches[0]);
        }
    }
    add(p) {
        const row = this.state.rows.find((r) => r.id === p.id);
        if (row) {
            row.qty = String((Number(row.qty) || 0) + 1);
        } else {
            this.state.rows.unshift({ id: p.id, name: p.name, stock: p.stock, qty: this.state.mode === "count" ? "" : "1" });
        }
        this.state.q = "";
    }
    remove(r) {
        this.state.rows = this.state.rows.filter((x) => x.id !== r.id);
    }
    diff(r) {
        return r.qty === "" ? null : (Number(r.qty) || 0) - (r.stock || 0);
    }
    async apply() {
        const lines = this.state.rows.filter((r) => r.qty !== "").map((r) => ({ product_id: r.id, qty: Number(r.qty) || 0 }));
        if (!lines.length) {
            return;
        }
        this.state.busy = true;
        try {
            const n = await this.orm.call("pos.config", "pos_rt_stock_apply", [[this.state.configId], this.state.mode, lines, this.state.note]);
            this.notification.add(_t("%s product(s) updated.", n), { type: "success" });
            this.state.rows = [];
            await this.load();
        } finally {
            this.state.busy = false;
        }
    }
}

/** Retail on the counter: scale barcodes, points, baki, customer history, due collection. */
patch(PosMenu.prototype, {
    setup() {
        super.setup(...arguments);
        this.state.rt = { info: null, redeem: "", collect: "", busy: false };
    },
    handleScan(code) {
        const prefixes = this.features.scale_prefixes || [];
        if (code.length === 13 && /^\d+$/.test(code) && prefixes.includes(code.slice(0, 2))) {
            const plu = code.slice(2, 7);
            const value = Number(code.slice(7, 12));
            const products = this.state.data?.products || [];
            const p = products.find((x) => x.code === plu || x.code === String(Number(plu)) || x.barcode === plu);
            if (p) {
                const unit = this.price(p) || 1;
                const qty = this.features.scale_mode === "price" ? value / 100 / unit : value / 1000;
                this.addProduct(p, { qty: Math.round(qty * 1000) / 1000, separate: true });
                return true;
            }
        }
        return super.handleScan(...arguments);
    },
    onProduct(p) {
        if (this.features.ask_serial && p.tracking === "serial") {
            this.dialog.add(RtSerialDialog, {
                product: p,
                onOk: (serial) => {
                    if (this.state.cart.some((l) => l.extra?.serial === serial)) {
                        this.notification.add(_t("%s is already in the cart.", serial), { type: "warning" });
                        return;
                    }
                    this.addProduct(p, { key: `${p.id}-s${serial}`, qty: 1, extra: { serial }, label: serial, separate: false });
                },
            });
            return;
        }
        if (p.pack_qty > 1) {
            this.dialog.add(PsChoiceDialog, {
                title: p.name,
                withCount: true,
                choices: [
                    { id: "piece", label: _t("Piece"), sub: this.money(this.price(p)), factor: 1 },
                    { id: "pack", label: `${p.pack_name} (${p.pack_qty})`, sub: this.money(this.price(p) * p.pack_qty), factor: p.pack_qty },
                ],
                onPick: (choice, count) => {
                    if (choice.id === "piece") {
                        return super.onProduct(p);
                    }
                    const key = `${p.id}-pack`;
                    const line = this.state.cart.find((l) => l.key === key);
                    if (line) {
                        line.extra = { ...line.extra, pack: (line.extra.pack || 0) + count };
                        line.qty += count * p.pack_qty;
                        this.cartChanged();
                    } else {
                        this.addProduct(p, { key, qty: count * p.pack_qty, extra: { pack: count }, label: `${count} ${p.pack_name}` });
                    }
                },
            });
            return;
        }
        return super.onProduct(...arguments);
    },
    get quickProducts() {
        return (this.state.data?.products || []).filter((p) => p.quick).slice(0, 18);
    },
    async setPartner(value) {
        super.setPartner(...arguments);
        this.state.rt.info = null;
        this.state.rt.redeem = "";
        if (value?.id && (this.features.points || this.features.credit)) {
            this.state.rt.info = await this.orm.silent.call("pos.config", "pos_rt_customer_info", [[this.configId], value.id]);
        }
    },
    setRedeem(value) {
        const info = this.state.rt.info;
        const points = Math.max(0, Math.min(Number(value) || 0, info?.points || 0));
        this.state.rt.redeem = points ? String(points) : "";
        this.state.extra = { ...this.state.extra, redeem_points: points || 0 };
        this.cartChanged();
    },
    clearCart() {
        super.clearCart(...arguments);
        if (this.state.rt) {
            this.state.rt.redeem = "";
        }
    },
    checkTenders() {
        const error = super.checkTenders(...arguments);
        if (error) {
            return error;
        }
        const later = this.state.payments.filter((p) => this.method(p.method_id)?.kind === "later" && Number(p.amount) > 0);
        if (later.length) {
            if (!this.state.partner) {
                return _t("Choose the customer to sell on credit (baki).");
            }
            const info = this.state.rt.info;
            const amount = later.reduce((s, p) => s + Number(p.amount), 0);
            if (info && info.credit_limit > 0 && info.due + amount > info.credit_limit + 0.001) {
                return _t("Baki limit reached: due %(due)s, limit %(limit)s.", {
                    due: this.money(info.due),
                    limit: this.money(info.credit_limit),
                });
            }
        }
        return "";
    },
    async collectDue() {
        const amount = Number(this.state.rt.collect);
        if (!(amount > 0) || !this.state.partner || this.state.rt.busy) {
            return;
        }
        this.state.rt.busy = true;
        try {
            const res = await this.orm.call("pos.config", "pos_rt_collect_due", [[this.configId], this.state.partner.id, amount]);
            this.notification.add(_t("%(amount)s received (%(ref)s)", { amount: this.money(res.amount), ref: res.payment }), {
                type: "success",
            });
            this.state.rt.collect = "";
            this.state.rt.info = { ...this.state.rt.info, due: res.due };
        } finally {
            this.state.rt.busy = false;
        }
    },
});

const icons = registry.category("pos_modern.menu_icons");
icons.add("pos_retail_bd.menu_offers", "fa-tags");
icons.add("pos_retail_bd.menu_baki", "fa-book");
icons.add("pos_retail_bd.menu_points", "fa-star-o");
icons.add("pos_retail_bd.menu_packs", "fa-cubes");
icons.add("pos_retail_bd.menu_stock_count", "fa-clipboard");
registry.category("actions").add("pos_retail_bd.stock", RtStockPage);
