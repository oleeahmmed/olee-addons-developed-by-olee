import { Component, onWillStart, onWillUnmount, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { printSessionReport } from "./print";

/**
 * Customer picker of the counter: search by name or mobile number in any format
 * ("01712-345678", "+880 1712…"), and create a customer from what was typed.
 */
export class PsCustomerPicker extends Component {
    static template = "pos_modern.CustomerPicker";
    static props = {
        configId: Number,
        value: { type: [Object, Boolean], optional: true }, // { id, name, phone }
        onSelect: Function,
    };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.state = useState({ q: "", open: false, results: [], active: 0, loading: false });
        this.timer = null;
        onWillUnmount(() => clearTimeout(this.timer));
    }
    onFocus() {
        this.state.open = true;
        this.search();
    }
    onBlur() {
        setTimeout(() => (this.state.open = false), 180);
    }
    onInput(ev) {
        this.state.q = ev.target.value;
        this.state.open = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.search(), 220);
    }
    async search() {
        this.state.loading = true;
        try {
            this.state.results = await this.orm.silent.call("pos.config", "pos_modern_customers", [
                [this.props.configId],
                this.state.q,
            ]);
            this.state.active = 0;
        } finally {
            this.state.loading = false;
        }
    }
    get looksLikePhone() {
        return /^[+\d][\d\s-]{6,}$/.test(this.state.q.trim());
    }
    pick(row) {
        this.props.onSelect(row);
        Object.assign(this.state, { q: "", open: false });
        document.activeElement?.blur?.();
    }
    clear() {
        this.props.onSelect(false);
    }
    async create() {
        const q = this.state.q.trim();
        if (!q) {
            return;
        }
        const phone = this.looksLikePhone ? q : "";
        const name = this.looksLikePhone ? "" : q;
        const row = await this.orm.call("pos.config", "pos_modern_quick_customer", [[this.props.configId], name, phone]);
        this.notification.add(_t("Customer %s created", row.name), { type: "success" });
        this.pick(row);
    }
    onKeydown(ev) {
        const n = this.state.results.length;
        if (ev.key === "ArrowDown" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active + 1) % n;
        } else if (ev.key === "ArrowUp" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active - 1 + n) % n;
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            if (n) {
                this.pick(this.state.results[this.state.active]);
            } else {
                this.create();
            }
        } else if (ev.key === "Escape") {
            this.state.open = false;
        }
    }
}

/** Held bills of the shop: take one back to the cart, or drop it. */
export class PsHeldDialog extends Component {
    static template = "pos_modern.HeldDialog";
    static components = { Dialog };
    static props = { configId: Number, currencyId: Number, onTake: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ loading: true, rows: [] });
        onWillStart(() => this.load());
    }
    async load() {
        this.state.rows = await this.orm.call("pos.config", "pos_modern_holds", [[this.props.configId]]);
        this.state.loading = false;
    }
    money(v) {
        return formatCurrency(v || 0, this.props.currencyId);
    }
    take(row) {
        this.props.onTake(row);
        this.props.close();
    }
    async drop(row) {
        await this.orm.unlink("pos.modern.hold", [row.id]);
        await this.load();
    }
}

/** Day end: X report, cash in / out, count the drawer, close the session, Z report. */
export class PsDayEndDialog extends Component {
    static template = "pos_modern.DayEndDialog";
    static components = { Dialog };
    static props = { configId: Number, sessionId: Number, onClosed: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.state = useState({
            loading: true,
            report: null,
            counted: "",
            notes: "",
            move: { kind: "out", amount: "", reason: "" },
            busy: false,
            message: "",
            closed: false,
        });
        onWillStart(() => this.load());
    }
    async load() {
        this.state.report = await this.orm.call("pos.session", "pos_modern_session_report", [[this.props.sessionId]]);
        this.state.loading = false;
    }
    money(v) {
        return formatCurrency(v || 0, this.state.report?.currency_id);
    }
    get difference() {
        const r = this.state.report;
        if (!r || this.state.counted === "") {
            return null;
        }
        return (Number(this.state.counted) || 0) - (r.cash.expected || 0);
    }
    get differenceOk() {
        return this.difference !== null && Math.abs(this.difference) < 0.01;
    }
    async cashMove() {
        const m = this.state.move;
        if (!(Number(m.amount) > 0)) {
            return;
        }
        this.state.busy = true;
        try {
            this.state.report = await this.orm.call("pos.session", "pos_modern_cash_move", [
                [this.props.sessionId],
                m.kind,
                Number(m.amount),
                m.reason,
            ]);
            Object.assign(m, { amount: "", reason: "" });
            this.notification.add(_t("Cash move saved"), { type: "success" });
        } finally {
            this.state.busy = false;
        }
    }
    printX() {
        printSessionReport(this.state.report);
    }
    async closeSession() {
        this.state.busy = true;
        this.state.message = "";
        try {
            const res = await this.orm.call("pos.session", "pos_modern_close", [
                [this.props.sessionId],
                Number(this.state.counted) || 0,
                this.state.notes,
            ]);
            if (!res.successful) {
                this.state.message = res.message || _t("The session could not be closed.");
                return;
            }
            this.state.report = res.report;
            this.state.closed = true;
            printSessionReport(res.report);
            this.props.onClosed();
        } finally {
            this.state.busy = false;
        }
    }
}

/** Manager PIN for a discount over the cashier's limit. */
export class PsPinDialog extends Component {
    static template = "pos_modern.PinDialog";
    static components = { Dialog };
    static props = { configId: Number, onOk: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ pin: "", error: "" });
    }
    press(d) {
        if (d === "del") {
            this.state.pin = this.state.pin.slice(0, -1);
        } else if (this.state.pin.length < 12) {
            this.state.pin += d;
        }
        this.state.error = "";
    }
    async ok() {
        const ok = await this.orm.call("pos.config", "pos_modern_check_pin", [[this.props.configId], this.state.pin]);
        if (!ok) {
            this.state.error = _t("Wrong PIN");
            this.state.pin = "";
            return;
        }
        this.props.onOk(this.state.pin);
        this.props.close();
    }
    onKey(ev) {
        if (/^\d$/.test(ev.key)) {
            this.press(ev.key);
        } else if (ev.key === "Backspace") {
            this.press("del");
        } else if (ev.key === "Enter") {
            this.ok();
        }
    }
}
