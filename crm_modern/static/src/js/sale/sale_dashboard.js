import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { UI } from "../components/ui";
import { shortDate } from "../core/utils";
import { OD_COMPONENTS, moneyFormatters, number } from "../dash/kit";
import { STATE_BADGE } from "./sale_section";

/** Dashboard section: quotation pipeline and orders won from CRM opportunities. */
export class SaleDashboardSection extends Component {
    static template = "crm_modern.SaleDashboardSection";
    static components = { ...UI, ...OD_COMPONENTS };
    static props = { currencyId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.stateBadge = STATE_BADGE;
        this.state = useState({ data: null });
        this.number = number;
        this.m = (v) => this.fmt.full(v);
        this.ms = (v) => this.fmt.short(v);
        onWillStart(async () => {
            const data = await this.orm.call("crm.lead", "crm_modern_sale_dashboard", []);
            if (data) {
                this.fmt = moneyFormatters(data.currency_id || this.props.currencyId, data.lakh);
            }
            this.state.data = data;
        });
    }
    shortDate(v) {
        return shortDate(v);
    }
    go(xmlid) {
        this.action.doAction(xmlid);
    }
    openOrder(order) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "sale.order",
            res_id: order.id,
            views: [[false, "form"]],
            target: "current",
        });
    }
}

registry.category("crm_modern.dashboard_sections").add("crm_modern.sale_dashboard", {
    Component: SaleDashboardSection,
    isVisible: (features) => Boolean(features.sale),
});
