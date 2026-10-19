import { Component, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { RecordPicker } from "../components/record_picker";
import { UI } from "../components/ui";
import { money, shortDate } from "../core/utils";

export const STATE_BADGE = {
    draft: { label: _t("Quotation"), tone: "" },
    sent: { label: _t("Sent"), tone: "cm-badge-info" },
    sale: { label: _t("Sales order"), tone: "cm-badge-success" },
    cancel: { label: _t("Cancelled"), tone: "cm-badge-danger" },
};
export const INVOICE_BADGE = {
    "to invoice": { label: _t("To invoice"), tone: "cm-badge-warning" },
    invoiced: { label: _t("Invoiced"), tone: "cm-badge-success" },
    upselling: { label: _t("Upsell"), tone: "cm-badge-violet" },
};

let lineSeq = 0;
function newLine() {
    return { key: ++lineSeq, product: false, qty: 1, price: "", listPrice: 0 };
}

/**
 * "Quotation" tab of the opportunity page: the whole sale_crm flow in one small box.
 * - existing quotations / orders with their next step (Send, Confirm, Invoice)
 * - a quick quote builder: customer → products → Save / Send / Confirm order
 * Everything goes through Odoo's own sale.order methods and wizards.
 */
export class SaleTab extends Component {
    static template = "crm_modern.SaleTab";
    static components = { ...UI, RecordPicker };
    static props = { record: Object, reload: Function };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.stateBadge = STATE_BADGE;
        this.invoiceBadge = INVOICE_BADGE;
        this.productDomain = [["sale_ok", "=", true]];
        this.state = useState({ data: null, busy: false, building: false, lines: [newLine()] });
        onWillStart(() => this.load(this.props.record));
        onWillUpdateProps((next) => this.load(next.record));
    }

    async load(record) {
        const data = await this.orm.call("crm.lead", "crm_modern_sale_data", [record.id]);
        if (!data || !Array.isArray(data.orders)) {
            this.state.data = null;
            return;
        }
        this.state.data = data;
        if (!data.orders.length) {
            this.state.building = true;
        }
    }
    async refresh() {
        await this.load(this.props.record);
        await this.props.reload(); // chatter + expected revenue (sale_crm may raise it from the order)
    }

    m(v, order) {
        return money(v, order?.currency_id?.[0] || this.state.data?.currency_id);
    }
    shortDate(v) {
        return shortDate(v);
    }
    get orders() {
        const rank = { draft: 0, sent: 0, sale: 1, cancel: 2 };
        return [...(this.state.data?.orders || [])].sort((a, b) => rank[a.state] - rank[b.state]);
    }
    get steps() {
        const orders = this.state.data?.orders || [];
        const live = orders.filter((o) => o.state !== "cancel");
        return [
            { label: _t("Quotation"), on: live.length > 0 },
            { label: _t("Sent"), on: live.some((o) => o.state !== "draft") },
            { label: _t("Order"), on: live.some((o) => o.state === "sale") },
            { label: _t("Invoiced"), on: live.some((o) => o.invoice_status === "invoiced") },
        ];
    }

    // ---------- quick quote builder ----------
    toggleBuilder() {
        this.state.building = !this.state.building;
    }
    async pickCustomer(partner) {
        await this.run(this.orm.call("crm.lead", "crm_modern_set_customer", [[this.props.record.id]], { partner_id: partner[0] }));
        await this.refresh();
    }
    async createCustomer() {
        await this.run(this.orm.call("crm.lead", "crm_modern_set_customer", [[this.props.record.id]]));
        this.notification.add(_t("Customer created"), { type: "success" });
        await this.refresh();
    }
    async pickProduct(line, product) {
        const [p] = await this.orm.read("product.product", [product[0]], ["lst_price"]);
        Object.assign(line, { product, listPrice: p ? p.lst_price : 0, price: "" });
        if (this.state.lines[this.state.lines.length - 1].key === line.key) {
            this.state.lines.push(newLine()); // keep one empty row ready
        }
    }
    setQty(line, ev) {
        line.qty = Math.max(0, Number(ev.target.value) || 0);
    }
    setPrice(line, ev) {
        line.price = ev.target.value;
    }
    removeLine(line) {
        this.state.lines = this.state.lines.filter((l) => l.key !== line.key);
        if (!this.state.lines.length) {
            this.state.lines.push(newLine());
        }
    }
    lineTotal(line) {
        const price = line.price === "" ? line.listPrice : Number(line.price) || 0;
        return price * line.qty;
    }
    get filledLines() {
        return this.state.lines.filter((l) => l.product);
    }
    get estimate() {
        return this.filledLines.reduce((sum, l) => sum + this.lineTotal(l), 0);
    }
    async createQuotation(then) {
        const lines = this.filledLines.map((l) => ({
            product_id: l.product[0],
            qty: l.qty,
            price_unit: l.price === "" ? false : Number(l.price),
        }));
        const result = await this.run(
            this.orm.call("crm.lead", "crm_modern_quick_quotation", [[this.props.record.id], lines], { then })
        );
        Object.assign(this.state, { lines: [newLine()], building: false });
        const labels = {
            draft: _t("Quotation %s created", result.name),
            send: _t("Quotation %s created — review the email and send", result.name),
            confirm: _t("Sales order %s confirmed", result.name),
        };
        this.notification.add(labels[then], { type: "success" });
        if (result.action) {
            return this.doActionThenRefresh(result.action);
        }
        return this.refresh();
    }
    /** Odoo's full quotation form, prefilled from the opportunity (sale_crm). */
    async fullForm() {
        const action = await this.run(
            this.orm.call("crm.lead", "action_sale_quotations_new", [[this.props.record.id]], { context: this.leadContext })
        );
        return this.action.doAction(action, { additionalContext: this.leadContext, onClose: () => this.refresh() });
    }

    // ---------- existing orders ----------
    async run(promise) {
        this.state.busy = true;
        try {
            return await promise;
        } finally {
            this.state.busy = false;
        }
    }
    doActionThenRefresh(action, options = {}) {
        return new Promise((resolve) => this.action.doAction(action, { ...options, onClose: resolve })).then(() =>
            this.refresh()
        );
    }
    get leadContext() {
        // what Odoo's own opportunity form passes to its buttons (sale_crm uses active_id)
        const id = this.props.record.id;
        return { active_id: id, active_ids: [id], active_model: "crm.lead" };
    }
    open(order) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "sale.order",
            res_id: order.id,
            views: [[false, "form"]],
            target: "current",
        });
    }
    async send(order) {
        const action = await this.run(this.orm.call("sale.order", "action_quotation_send", [[order.id]]));
        return this.doActionThenRefresh(action);
    }
    async confirm(order) {
        const result = await this.run(this.orm.call("sale.order", "action_confirm", [[order.id]]));
        if (result && typeof result === "object") {
            return this.doActionThenRefresh(result);
        }
        this.notification.add(_t("%s confirmed", order.name), { type: "success" });
        return this.refresh();
    }
    async cancel(order) {
        const result = await this.run(this.orm.call("sale.order", "action_cancel", [[order.id]]));
        if (result && typeof result === "object") {
            return this.doActionThenRefresh(result);
        }
        return this.refresh();
    }
    invoice(order) {
        return this.doActionThenRefresh("sale.action_view_sale_advance_payment_inv", {
            additionalContext: { active_model: "sale.order", active_ids: [order.id], active_id: order.id },
        });
    }
    print(order) {
        return this.action.doAction("sale.action_report_saleorder", {
            additionalContext: { active_model: "sale.order", active_ids: [order.id], active_id: order.id },
        });
    }
}

registry.category("crm_modern.record_tabs").add("crm_modern.sale_quotation", {
    label: _t("Quotation"),
    icon: "fa-file-text-o",
    sequence: 10,
    Component: SaleTab,
    isVisible: (record, features) => record?.type === "opportunity" && Boolean(features.sale),
});
