import { Component, onWillStart, useState } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { usePinApp } from "@pos_modern/js/app_context";
import { APP_XMLID } from "@pos_modern/js/pages";

/**
 * Wallet reconciliation: every bKash / Nagad / Rocket / Upay / card payment of the
 * chosen days with its TrxID. Tick what is in the merchant statement, or paste the
 * statement and let the TrxIDs tick themselves.
 */
export class PosBdReconcile extends Component {
    static template = "pos_bd_payment.Reconcile";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        usePinApp(APP_XMLID);
        this.state = useState({
            loading: true,
            data: null,
            filters: { date_from: "", date_to: "", config_id: "", provider: "", state: "all" },
            statement: "",
            unknown: [],
            showPaste: false,
        });
        onWillStart(() => this.load());
    }
    async load() {
        const f = this.state.filters;
        const data = await this.orm.call("pos.config", "pos_bd_reconcile_data", [
            f.date_from || false,
            f.date_to || false,
            Number(f.config_id) || false,
            f.provider || false,
            f.state,
        ]);
        this.state.data = data;
        f.date_from = data.date_from;
        f.date_to = data.date_to;
        this.state.loading = false;
    }
    money(v) {
        return formatCurrency(v || 0, this.state.data?.currency_id);
    }
    setFilter(key, value) {
        this.state.filters[key] = value;
        this.load();
    }
    get summary() {
        const rows = this.state.data?.rows || [];
        const total = rows.reduce((s, r) => s + r.amount, 0);
        const verified = rows.filter((r) => r.verified).reduce((s, r) => s + r.amount, 0);
        return { total, verified, left: total - verified, count: rows.length };
    }
    async toggle(row) {
        await this.orm.call("pos.payment", "pos_bd_set_verified", [[row.id], !row.verified]);
        row.verified = !row.verified;
    }
    async match() {
        const ids = (this.state.data?.rows || []).map((r) => r.id);
        const res = await this.orm.call("pos.config", "pos_bd_reconcile_match", [ids, this.state.statement]);
        this.state.unknown = res.unknown;
        this.notification.add(_t("%s payment(s) ticked from the statement.", res.matched), { type: "success" });
        await this.load();
    }
    openOrder(row) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "pos.order",
            res_id: row.order_id,
            views: [[false, "form"]],
        });
    }
}

registry.category("actions").add("pos_bd_payment.reconcile", PosBdReconcile);
