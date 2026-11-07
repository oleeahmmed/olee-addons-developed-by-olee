import { Component, onMounted, onWillStart, onWillUnmount, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { PosMenu, PosTables } from "@pos_modern/js/menu";
import { usePinApp } from "@pos_modern/js/app_context";
import { APP_XMLID } from "@pos_modern/js/pages";
import { printTemplate, receiptMoney } from "@pos_modern/js/counter/print";
import { Dialog } from "@web/core/dialog/dialog";

/** Pick the table a bill moves to (a table with a bill: the two bills are merged). */
export class RbTablePicker extends Component {
    static template = "pos_restaurant_bd.TablePicker";
    static components = { Dialog };
    static props = { configId: Number, current: [Number, Boolean], onPick: Function, close: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ loading: true, data: null, floorId: false });
        onWillStart(async () => {
            this.state.data = await this.orm.call("pos.config", "pos_modern_tables", [this.props.configId]);
            this.state.floorId = this.state.data.floors[0]?.id || false;
            this.state.loading = false;
        });
    }
    get floor() {
        return (this.state.data?.floors || []).find((f) => f.id === this.state.floorId);
    }
    pick(t) {
        if (t.id === this.props.current) {
            return;
        }
        this.props.onPick(t);
        this.props.close();
    }
}

function printKot(ticket, width) {
    if (ticket) {
        printTemplate("pos_restaurant_bd.Kot", { t: ticket }, width);
    }
}

patch(PosMenu.prototype, {
    setup() {
        super.setup(...arguments);
        this.state.rbBusy = false;
    },
    async load() {
        await super.load(...arguments);
        if (this.features.rb && !this.state.extra.order_type) {
            this.state.extra = { ...this.state.extra, order_type: this.state.tableId ? "dine_in" : this.features.default_order_type };
        }
    },
    clearCart() {
        super.clearCart(...arguments);
        if (this.features?.rb) {
            this.state.extra = { order_type: this.features.default_order_type || "dine_in" };
        }
    },
    get orderType() {
        return this.state.extra.order_type || this.features.default_order_type || "dine_in";
    },
    setOrderType(type) {
        this.state.extra = { ...this.state.extra, order_type: type };
        this.cartChanged();
    },
    setExtra(key, value) {
        this.state.extra = { ...this.state.extra, [key]: value };
        if (["delivery_charge", "guests"].includes(key)) {
            this.cartChanged();
        }
    },
    sentQty(line) {
        return Number((this.state.extra.sent || {})[line.key] || 0);
    },
    get unsentCount() {
        return this.cartLines.reduce((s, l) => s + Math.max(0, l.qty - this.sentQty(l)), 0);
    },
    async sendKitchen() {
        if (!this.unsentCount || this.state.rbBusy) {
            return;
        }
        this.state.rbBusy = true;
        try {
            const res = await this.orm.call("pos.config", "pos_rb_send_kitchen", [[this.configId], this.buildPayload()]);
            this.state.extra = { ...this.state.extra, sent: res.sent };
            this.state.holdId = res.hold.id;
            if (this.features.print_kot) {
                for (const t of res.tickets || []) {
                    printKot(t, res.width);
                }
            }
            this.notification.add(
                res.ticket ? _t("%s sent to the kitchen", res.ticket.name) : _t("Nothing new for the kitchen"),
                { type: "success" }
            );
            if (this.state.tableId) {
                // the table's bill stays open: back to the floor plan
                this.clearCart();
                this.state.partner = false;
                this.clearTable();
                this.state.data.held_count = (this.state.data.held_count || 0) + 1;
            }
        } finally {
            this.state.rbBusy = false;
        }
    },
    get staffWaiters() {
        return (this.features.staff || []).filter((s) => s.kind === "waiter");
    },
    get staffRiders() {
        return (this.features.staff || []).filter((s) => s.kind === "rider");
    },
    setStaff(key, value) {
        this.setExtra(key, Number(value) || false);
    },
    complimentary(line) {
        const l = this.findLine(line);
        if (!l) {
            return;
        }
        const on = !l.extra?.comp;
        l.extra = { ...(l.extra || {}), comp: on };
        l.discount = on ? 100 : 0;
        this.cartChanged();
    },
    async requestBill() {
        if (!this.cartLines.length || this.state.rbBusy) {
            return;
        }
        this.state.rbBusy = true;
        try {
            const res = await this.orm.call("pos.config", "pos_rb_request_bill", [[this.configId], this.buildPayload()]);
            this.state.holdId = res.hold.id;
            const d = this.state.data;
            printTemplate("pos_restaurant_bd.GuestCheck", {
                q: res.quote,
                shop: d.config_name,
                company: d.company,
                table: this.state.tableName,
                waiter: this.staffWaiters.find((w) => w.id === Number(this.state.extra.waiter_id))?.name || "",
                date: new Date().toLocaleString(),
                money: receiptMoney(d.currency_id),
            }, this.features.receipt_width);
            this.notification.add(_t("Bill printed: the table waits for payment."), { type: "info" });
        } finally {
            this.state.rbBusy = false;
        }
    },
    async moveTable() {
        if (!this.cartLines.length) {
            return;
        }
        // keep what is on screen, then move / merge the saved bill
        const label = this.state.tableName || this.state.partner?.name || "";
        const hold = await this.orm.call("pos.config", "pos_modern_hold", [[this.configId], this.buildPayload(), label]);
        this.state.holdId = hold.id;
        this.dialog.add(RbTablePicker, {
            configId: this.configId,
            current: this.state.tableId,
            onPick: async (table) => {
                const res = await this.orm.call("pos.config", "pos_rb_move", [[this.configId], hold.id, table.id]);
                this.notification.add(res.merged ? _t("Bills merged on table %s", table.number) : _t("Moved to table %s", table.number), { type: "success" });
                this.clearCart();
                this.state.partner = false;
                this.clearTable();
            },
        });
    },
    orderPaid(result) {
        super.orderPaid(...arguments);
        if (result.kot && this.features.print_kot) {
            setTimeout(() => printKot(result.kot, this.features.receipt_width), 800);
        }
    },
});

patch(PosTables.prototype, {
    planOf(floor) {
        const tables = floor?.tables || [];
        if (!tables.length || !tables.some((t) => t.x !== undefined)) {
            return null;
        }
        const w = Math.max(...tables.map((t) => (t.x || 0) + (t.w || 80))) + 24;
        const h = Math.max(...tables.map((t) => (t.y || 0) + (t.h || 80))) + 24;
        return { w, h };
    },
    tableStyle(t) {
        return `left:${t.x || 0}px;top:${t.y || 0}px;width:${t.w || 80}px;height:${t.h || 80}px;`;
    },
});

/** Kitchen display: tickets of a restaurant shop, refreshed every 8 seconds. */
export class RbKitchenScreen extends Component {
    static template = "pos_restaurant_bd.Kds";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        usePinApp(APP_XMLID);
        this.state = useState({ loading: true, shops: [], configId: false, data: null, filter: "all", station: "" });
        onWillStart(async () => {
            this.state.shops = await this.orm.call("pos.config", "pos_rb_kds_shops", []);
            const saved = Number(window.localStorage?.getItem("pos_restaurant_bd.kds") || 0);
            this.state.configId = this.state.shops.find((s) => s.id === saved)?.id || this.state.shops[0]?.id || false;
            await this.load();
        });
        onMounted(() => (this.timer = setInterval(() => this.load(), 8000)));
        onWillUnmount(() => clearInterval(this.timer));
    }
    async load() {
        if (!this.state.configId) {
            this.state.loading = false;
            return;
        }
        this.state.data = await this.orm.silent.call("pos.config", "pos_rb_kds", [[this.state.configId]]);
        this.state.loading = false;
    }
    setShop(id) {
        this.state.configId = Number(id);
        try {
            window.localStorage.setItem("pos_restaurant_bd.kds", String(id));
        } catch {
            // private window
        }
        this.load();
    }
    get stations() {
        return [...new Set((this.state.data?.tickets || []).map((t) => t.station).filter(Boolean))];
    }
    get tickets() {
        let all = this.state.data?.tickets || [];
        if (this.state.station) {
            all = all.filter((t) => t.station === this.state.station);
        }
        return this.state.filter === "all" ? all : all.filter((t) => t.state === this.state.filter);
    }
    count(state) {
        return (this.state.data?.tickets || []).filter((t) => t.state === state).length;
    }
    async setState(ticket, state) {
        await this.orm.call("pos.rb.ticket", "pos_rb_set_state", [[ticket.id], state]);
        await this.load();
    }
    async toggleLine(line) {
        await this.orm.call("pos.rb.ticket.line", "pos_rb_toggle", [[line.id]]);
        line.done = !line.done;
    }
}

registry.category("actions").add("pos_restaurant_bd.kds", RbKitchenScreen);
registry.category("pos_modern.menu_icons").add("pos_restaurant_bd.menu_kds", "fa-fire");
registry.category("pos_modern.menu_icons").add("pos_restaurant_bd.menu_tickets", "fa-ticket");
registry.category("pos_modern.menu_icons").add("pos_restaurant_bd.menu_staff", "fa-id-badge");
