import { Component, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

/** Old campaign page URL: send people back to the list (edit is a drawer there). */
export class CampaignDetail extends Component {
    static template = "crm_modern.CampaignDetail";
    static props = ["*"];

    setup() {
        this.action = useService("action");
        onWillStart(() => this.action.doAction("crm_modern.action_campaigns"));
    }
}

registry.category("actions").add("crm_modern.campaign", CampaignDetail);
