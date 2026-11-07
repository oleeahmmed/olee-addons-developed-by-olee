import { Component, onWillStart, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { PosMenu } from "@pos_modern/js/menu";
import { usePinApp } from "@pos_modern/js/app_context";
import { APP_XMLID } from "@pos_modern/js/pages";
import { printTemplate } from "@pos_modern/js/counter/print";

/** Morning bake or wastage: products and quantities. */
export class BkStockDialog extends Component {
    static template = "pos_bakery.StockDialog";
    static components = { Dialog };
    static props = { mode: String, configId: Number, products: Array, onDone: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.state = useState({ q: "", rows: [], note: "", busy: false });
    }
    get title() {
        return this.props.mode === "bake" ? _t("Morning bake") : _t("Wastage");
    }
    get matches() {
        const q = this.state.q.trim().toLowerCase();
        if (!q) {
            return [];
        }
        return this.props.products.filter((p) => p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase() === q).slice(0, 8);
    }
    add(p) {
        if (!this.state.rows.find((r) => r.id === p.id)) {
            this.state.rows.push({ id: p.id, name: p.name, qty: "" });
        }
        this.state.q = "";
    }
    remove(r) {
        this.state.rows = this.state.rows.filter((x) => x.id !== r.id);
    }
    async save() {
        const lines = this.state.rows.filter((r) => Number(r.qty) > 0).map((r) => ({ product_id: r.id, qty: Number(r.qty) }));
        if (!lines.length) {
            return;
        }
        this.state.busy = true;
        try {
            if (this.props.mode === "bake") {
                await this.orm.call("pos.config", "pos_bk_bake", [[this.props.configId], lines, this.state.note]);
                this.notification.add(_t("Bake saved: the stock is updated."), { type: "success" });
            } else {
                const n = await this.orm.call("pos.config", "pos_bk_waste", [[this.props.configId], lines, this.state.note]);
                this.notification.add(_t("%s item(s) written off.", n), { type: "success" });
            }
            this.props.onDone();
            this.props.close();
        } finally {
            this.state.busy = false;
        }
    }
}

/** New cake order: the advance is taken now, the cake sold on delivery. */
export class BkCakeDialog extends Component {
    static template = "pos_bakery.CakeDialog";
    static components = { Dialog };
    static props = { configId: Number, products: Array, partner: [Object, Boolean], money: Function,
        onSaved: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            q: "", product: null, flavour: "", weight: "", message: "", delivery_at: "", price_total: "", advance: "",
            customer_name: this.props.partner?.name || "", phone: this.props.partner?.phone || "", note: "", busy: false, error: "",
        });
    }
    get matches() {
        const q = this.state.q.trim().toLowerCase();
        return q ? this.props.products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
    }
    pickProduct(p) {
        this.state.product = p;
        this.state.q = "";
        if (!this.state.price_total) {
            this.state.price_total = Math.round(p.incl * 100) / 100;
        }
    }
    async save() {
        const s = this.state;
        s.error = "";
        if (!s.product) {
            s.error = _t("Choose the cake.");
            return;
        }
        s.busy = true;
        try {
            const row = await this.orm.call("pos.config", "pos_bk_cake_save", [[this.props.configId], {
                product_id: s.product.id,
                partner_id: this.props.partner?.id || false,
                customer_name: s.customer_name,
                phone: s.phone,
                delivery_at: s.delivery_at,
                flavour: s.flavour,
                weight: s.weight,
                message: s.message,
                note: s.note,
                price_total: Number(s.price_total) || 0,
                advance: Number(s.advance) || 0,
            }]);
            this.props.onSaved(row, s.product);
            this.props.close();
        } finally {
            s.busy = false;
        }
    }
}

/** Open cake orders: mark ready, deliver (sell it, the advance deducted). */
export class BkCakesDialog extends Component {
    static template = "pos_bakery.CakesDialog";
    static components = { Dialog };
    static props = { configId: Number, money: Function, onDeliver: Function, onAdvance: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ loading: true, rows: [] });
        onWillStart(() => this.load());
    }
    async load() {
        this.state.rows = await this.orm.call("pos.config", "pos_bk_cakes", [[this.props.configId], "open"]);
        this.state.loading = false;
    }
    async setState(row, state) {
        await this.orm.call("pos.bk.cake", "pos_bk_set_state", [[row.id], state]);
        await this.load();
    }
    deliver(row) {
        this.props.onDeliver(row);
        this.props.close();
    }
    advance(row) {
        this.props.onAdvance(row);
        this.props.close();
    }
}

patch(PosMenu.prototype, {
    bakeryDialog(mode) {
        this.dialog.add(BkStockDialog, {
            mode,
            configId: this.configId,
            products: (this.state.data.products || []).filter((p) => p.storable),
            onDone: () => this.load(),
        });
    },
    newCake() {
        this.dialog.add(BkCakeDialog, {
            configId: this.configId,
            products: this.state.data.products || [],
            partner: this.state.partner,
            money: (v) => this.money(v),
            onSaved: (row, product) => this.cakeAdvance(row, product),
        });
    },
    cakeProduct(row) {
        return (this.state.data.products || []).find((p) => p.id === row.product_id);
    },
    cakeAdvance(row, product = null) {
        const p = product || this.cakeProduct(row);
        if (!p || !(row.advance > 0)) {
            this.notification.add(_t("Cake order %s saved.", row.name), { type: "success" });
            return;
        }
        this.addProduct(p, {
            key: `cake-adv-${row.id}`,
            qty: 1,
            extra: { bk_cake_id: row.id, bk_role: "advance" },
            label: _t("Advance for %s", row.name),
        });
        if (row.partner && !this.state.partner) {
            this.state.partner = { id: row.partner[0], name: row.partner[1] };
        }
    },
    openCakes() {
        this.dialog.add(BkCakesDialog, {
            configId: this.configId,
            money: (v) => this.money(v),
            onAdvance: (row) => this.cakeAdvance(row),
            onDeliver: (row) => {
                const p = this.cakeProduct(row);
                if (!p) {
                    this.notification.add(_t("The cake product is not on this counter."), { type: "warning" });
                    return;
                }
                this.addProduct(p, { key: `cake-${row.id}`, qty: 1, extra: { bk_cake_id: row.id, bk_role: "cake" }, label: row.name });
                if (row.partner && !this.state.partner) {
                    this.state.partner = { id: row.partner[0], name: row.partner[1] };
                }
            },
        });
    },
    orderPaid(result) {
        super.orderPaid(...arguments);
        const token = result.receipt?.extra?.token;
        if (token && this.features.token_slip) {
            setTimeout(() => printTemplate("pos_bakery.TokenSlip", { token, shop: this.state.data.config_name }, this.features.receipt_width), 900);
        }
    },
});

/** The bakery's day: baked, sold, wasted, left. */
export class BkDayPage extends Component {
    static template = "pos_bakery.Day";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        usePinApp(APP_XMLID);
        this.state = useState({ loading: true, data: null, shops: [], configId: false, day: "" });
        onWillStart(async () => {
            this.state.shops = await this.orm.searchRead("pos.config", [["bk_bakery", "=", true]], ["name"]);
            this.state.configId = this.state.shops[0]?.id || false;
            await this.load();
        });
    }
    async load() {
        if (!this.state.configId) {
            this.state.loading = false;
            return;
        }
        this.state.data = await this.orm.call("pos.config", "pos_bk_day_report", [[this.state.configId], this.state.day || false]);
        this.state.day = this.state.data.day;
        this.state.loading = false;
    }
    setDay(v) {
        this.state.day = v;
        this.load();
    }
    setShop(id) {
        this.state.configId = Number(id);
        this.load();
    }
}

registry.category("actions").add("pos_bakery.day", BkDayPage);
const icons = registry.category("pos_modern.menu_icons");
icons.add("pos_bakery.menu_bakery_day", "fa-birthday-cake");
icons.add("pos_bakery.menu_cakes", "fa-calendar");
icons.add("pos_bakery.menu_bakes", "fa-fire");
