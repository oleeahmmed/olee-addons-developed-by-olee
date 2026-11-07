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

/** Piece / strip / box picker of a medicine. */
export class PhUnitDialog extends Component {
    static template = "pos_pharmacy.UnitDialog";
    static components = { Dialog };
    static props = { product: Object, price: Function, onPick: Function, close: Function };

    setup() {
        this.state = useState({ unit: this.props.product.strip ? "strip" : "piece", count: 1 });
    }
    get units() {
        const p = this.props.product;
        const out = [{ id: "piece", label: _t("Piece"), pieces: 1 }];
        if (p.strip) {
            out.push({ id: "strip", label: _t("Strip (%s pcs)", p.strip), pieces: p.strip });
        }
        if (p.strip && p.box) {
            out.push({ id: "box", label: _t("Box (%s strips)", p.box), pieces: p.strip * p.box });
        }
        return out;
    }
    get unit() {
        return this.units.find((u) => u.id === this.state.unit) || this.units[0];
    }
    get pieces() {
        return this.unit.pieces * (Number(this.state.count) || 0);
    }
    step(d) {
        this.state.count = Math.max(1, (Number(this.state.count) || 1) + d);
    }
    ok() {
        if (this.pieces > 0) {
            this.props.onPick(this.unit, Number(this.state.count) || 1, this.pieces);
            this.props.close();
        }
    }
}

patch(PosMenu.prototype, {
    setup() {
        super.setup(...arguments);
        this.state.rx = { doctor: "", patient: "", age: "", ref: "" };
    },
    onProduct(p) {
        if (this.features.pharmacy && p.expiry_state === "expired") {
            this.notification.add(_t("Every batch of %s in stock is expired.", p.name), { type: "danger" });
            return;
        }
        if (this.features.pharmacy && p.strip) {
            this.dialog.add(PhUnitDialog, {
                product: p,
                price: (v) => this.money(v),
                onPick: (unit, count, pieces) => {
                    if (unit.id === "piece") {
                        this.addProduct(p, { qty: pieces });
                    } else {
                        // one line per unit kind: "3 strips" stays readable on the bill
                        const key = `${p.id}-${unit.id}`;
                        const line = this.state.cart.find((l) => l.key === key);
                        if (line) {
                            line.extra = { unit: unit.id, units: (line.extra.units || 0) + count };
                            line.qty += pieces;
                            this.cartChanged();
                        } else {
                            this.addProduct(p, { key, qty: pieces, extra: { unit: unit.id, units: count } });
                        }
                    }
                },
            });
            return;
        }
        return super.onProduct(...arguments);
    },
    get rxNeeded() {
        return this.features.pharmacy && this.cartLines.some((l) => l.product.rx);
    },
    buildPayload() {
        const payload = super.buildPayload(...arguments);
        if (this.features.pharmacy && Object.values(this.state.rx).some(Boolean)) {
            payload.extra = { ...payload.extra, rx: { ...this.state.rx } };
        }
        return payload;
    },
    checkTenders() {
        const error = super.checkTenders(...arguments);
        if (error) {
            return error;
        }
        if (this.rxNeeded && this.features.rx_mandatory && !(this.state.rx.doctor && this.state.rx.patient)) {
            return _t("A prescription medicine is in the cart: type the doctor and the patient.");
        }
        return "";
    },
    clearCart() {
        super.clearCart(...arguments);
        if (this.state.rx) {
            Object.assign(this.state.rx, { doctor: "", patient: "", age: "", ref: "" });
        }
    },
});

/** Batches expiring soon in the pharmacy's stock. */
export class PhExpiryPage extends Component {
    static template = "pos_pharmacy.Expiry";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        usePinApp(APP_XMLID);
        this.state = useState({ loading: true, data: null, days: 90, configId: "" });
        onWillStart(() => this.load());
    }
    async load() {
        this.state.data = await this.orm.call("pos.config", "pos_ph_expiry_data", [
            this.state.days,
            Number(this.state.configId) || false,
        ]);
        this.state.loading = false;
    }
    money(v) {
        return formatCurrency(v || 0, this.state.data?.currency_id);
    }
    setShop(value) {
        this.state.configId = value;
        this.load();
    }
    setDays(days) {
        this.state.days = days;
        this.load();
    }
    rowClass(r) {
        return r.days < 0 ? "is-danger" : r.days <= 30 ? "is-warning" : "";
    }
}

registry.category("actions").add("pos_pharmacy.expiry", PhExpiryPage);
registry.category("pos_modern.menu_icons").add("pos_pharmacy.menu_expiry", "fa-hourglass-end");
registry.category("pos_modern.menu_icons").add("pos_pharmacy.menu_medicines", "fa-medkit");
