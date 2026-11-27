import { Component, onWillStart, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { formatCurrency } from "@web/core/currency";
import { serializeDateTime } from "@web/core/l10n/dates";
import { registry } from "@web/core/registry";
import "@pos_modern/js/pages"; // registers pos_modern.orders first

const { DateTime } = luxon;

/** Today at a glance, above the Orders list: sales, orders, average ticket, refunds. */
export class PuxOrderStats extends Component {
    static template = "pos_ui_pro.OrderStats";
    static props = {};

    setup() {
        this.orm = useService("orm");
        this.state = useState({ ready: false, sales: 0, count: 0, refunds: 0, refundCount: 0, month: 0, currencyId: false });
        onWillStart(() => this.load());
    }
    async load() {
        const companies = user.context.allowed_company_ids || [];
        const start = DateTime.local().startOf("day");
        const month = DateTime.local().startOf("month");
        const base = [["state", "not in", ["draft", "cancel"]]];
        if (companies.length) {
            base.push(["company_id", "in", companies]);
        }
        const rows = await this.orm.searchRead(
            "pos.order",
            [...base, ["date_order", ">=", serializeDateTime(month)]],
            ["amount_total", "date_order", "currency_id"],
            { limit: 20000 }
        );
        let sales = 0, count = 0, refunds = 0, refundCount = 0, monthTotal = 0;
        for (const r of rows) {
            monthTotal += r.amount_total;
            const d = DateTime.fromSQL(r.date_order, { zone: "utc" });
            if (d >= start.toUTC()) {
                if (r.amount_total < 0) {
                    refunds += r.amount_total;
                    refundCount++;
                } else {
                    sales += r.amount_total;
                    count++;
                }
            }
        }
        Object.assign(this.state, {
            ready: true, sales, count, refunds: Math.abs(refunds), refundCount, month: monthTotal,
            currencyId: rows[0]?.currency_id?.[0] || user.activeCompany?.currency_id || false,
        });
    }
    money(v) {
        return this.state.currencyId ? formatCurrency(v, this.state.currencyId) : v.toFixed(2);
    }
    get avg() {
        return this.state.count ? this.state.sales / this.state.count : 0;
    }
}

// Shown above the Orders page only (pos_modern's "pos_modern.orders" action).
const ListPage = registry.category("actions").get("pos_modern.orders", null);
if (ListPage) {
    ListPage.components = { ...ListPage.components, PuxOrderStats };
}
