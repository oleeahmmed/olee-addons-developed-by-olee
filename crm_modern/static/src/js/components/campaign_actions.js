import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { loadFeatures } from "../core/features";
import { ImportDialog } from "./import_dialog";

/**
 * Upload CSV and jump to this campaign's leads / pipeline.
 * Hidden when the user cannot read crm.lead; Upload stays hidden without create.
 */
export class CampaignQuickActions extends Component {
    static template = "crm_modern.CampaignQuickActions";
    static props = { ...standardWidgetProps };

    setup() {
        this.dialog = useService("dialog");
        this.action = useService("action");
        this.orm = useService("orm");
        this.state = useState({ canCreate: false, canRead: false, useLeads: false });
        onWillStart(async () => {
            const [canCreate, canRead, features] = await Promise.all([
                user.checkAccessRight("crm.lead", "create").catch(() => false),
                user.checkAccessRight("crm.lead", "read").catch(() => false),
                loadFeatures(this.orm).catch(() => ({})),
            ]);
            this.state.canCreate = canCreate;
            this.state.canRead = canRead;
            this.state.useLeads = Boolean(features.use_leads);
        });
    }

    get campaign() {
        const rec = this.props.record;
        const team = rec.data.crm_modern_team_id;
        const owner = rec.data.user_id;
        return {
            id: rec.resId,
            title: rec.data.title,
            team: team ? [team.id, team.display_name] : false,
            team_id: team ? team.id : "",
            user_id: owner ? owner.id : "",
        };
    }

    async reload() {
        const model = this.props.record.model;
        if (typeof model.load === "function") {
            await model.load();
        } else if (model.root?.load) {
            await model.root.load();
        }
    }

    upload(ev) {
        ev.stopPropagation();
        if (!this.state.canCreate || !this.campaign.id) {
            return;
        }
        this.dialog.add(ImportDialog, {
            campaign: this.campaign,
            onImported: () => this.reload(),
        });
    }

    async openLeads(ev) {
        ev.stopPropagation();
        if (!this.campaign.id) {
            return;
        }
        const action = await this.orm.call("utm.campaign", "crm_modern_open_leads", [this.campaign.id]);
        return this.action.doAction(action);
    }

    async openPipeline(ev) {
        ev.stopPropagation();
        if (!this.campaign.id) {
            return;
        }
        const action = await this.orm.call("utm.campaign", "crm_modern_open_pipeline", [this.campaign.id]);
        return this.action.doAction(action);
    }
}

registry.category("view_widgets").add("crm_modern_campaign_actions", {
    component: CampaignQuickActions,
    fieldDependencies: [
        { name: "title", type: "char" },
        { name: "user_id", type: "many2one" },
        { name: "crm_modern_team_id", type: "many2one" },
    ],
});
