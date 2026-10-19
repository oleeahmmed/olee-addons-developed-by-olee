import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { loadFeatures } from "../core/features";
import { QuickCreateDialog } from "./dialogs";
import { ImportDialog } from "./import_dialog";

/**
 * Upload CSV / add lead / add opportunity on a campaign kanban card or form.
 * Hidden when the user cannot create crm.lead; Leads stays hidden if Settings ▸ Leads is off.
 */
export class CampaignQuickActions extends Component {
    static template = "crm_modern.CampaignQuickActions";
    static props = { ...standardWidgetProps };

    setup() {
        this.dialog = useService("dialog");
        this.action = useService("action");
        this.orm = useService("orm");
        this.state = useState({ canCreate: false, useLeads: false });
        onWillStart(async () => {
            const [canCreate, features] = await Promise.all([
                user.checkAccessRight("crm.lead", "create").catch(() => false),
                loadFeatures(this.orm).catch(() => ({})),
            ]);
            this.state.canCreate = canCreate;
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

    add(type, ev) {
        ev.stopPropagation();
        if (!this.state.canCreate || !this.campaign.id) {
            return;
        }
        const c = this.campaign;
        this.dialog.add(QuickCreateDialog, {
            type,
            defaults: { campaign_id: c.id, team_id: c.team_id, user_id: c.user_id },
            onSaved: () => this.reload(),
        });
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
