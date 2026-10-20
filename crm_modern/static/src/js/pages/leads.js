import { Component, onWillStart, useState } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";

import { registry } from "@web/core/registry";

import { user } from "@web/core/user";

import { useBus, useService } from "@web/core/utils/hooks";

import { QuickCreateDialog } from "../components/dialogs";

import { UI } from "../components/ui";

import { NativeView } from "../components/native_view";
import {

    leadEmbeddedViews,

    leadNativeProps,

    readStoredView,

    storeView,

} from "../core/lead_views";

import { useLeadActions } from "../core/hooks";



const VIEW_KEY = "crm_modern.leads.view.list";
const LEAD_VIEWS = ["list", "kanban", "calendar", "pivot", "graph", "activity"];



export class Leads extends Component {

    static template = "crm_modern.Leads";

    static components = { ...UI, NativeView };

    static props = ["*"];



    setup() {

        this.orm = useService("orm");

        this.dialog = useService("dialog");

        const ctx = this.props.action?.context || {};
        const stored = readStoredView(VIEW_KEY, "list");

        this.state = useState({

            enabled: true,

            campaign: ctx.crm_modern_campaign_id || "",

            view: LEAD_VIEWS.includes(stored) ? stored : "list",

            viewIds: {},

            nativeVersion: 0,

        });

        this.lead = useLeadActions(() => {

            this.state.nativeVersion++;

        });

        onWillStart(() => this.load());
        useBus(this.env.bus, "crm_modern:list-reload", () => {
            this.state.nativeVersion++;
        });

    }



    async load() {

        const [enabled, viewIds] = await Promise.all([

            user.hasGroup("crm.group_use_lead"),

            this.orm.call("crm.lead", "crm_modern_view_ids", []),

        ]);

        Object.assign(this.state, { enabled, viewIds });

    }



    get nativeProps() {

        const { views, viewSwitcherEntries } = leadEmbeddedViews(this.state.viewIds, "lead");

        return {

            ...leadNativeProps({

                kind: "lead",

                view: this.state.view,

                viewIds: this.state.viewIds,

                domain: [["type", "=", "lead"]],

                campaignId: this.state.campaign,

                onOpen: (id) => this.lead.open(id),

                onCreate: () => this.create(),

            }),

            views,

            viewSwitcherEntries,

            displayName: this.props.action?.display_name || _t("Leads"),

            onSwitchView: (type) => this.setView(type),

        };

    }



    get title() {
        return _t("Leads");
    }
    get subtitle() {
        return _t("Qualify incoming requests before they become opportunities");
    }
    get newLabel() {
        return _t("New lead");
    }
    setView(view) {
        if (!LEAD_VIEWS.includes(view)) {
            view = "list";
        }
        this.state.view = view;
        storeView(VIEW_KEY, view);
    }



    create() {

        return new Promise((resolve) =>

            this.dialog.add(

                QuickCreateDialog,

                {

                    type: "lead",

                    defaults: { campaign_id: this.state.campaign || "" },

                    onSaved: () => {

                        this.state.nativeVersion++;

                    },

                },

                { onClose: resolve }

            )

        );

    }

}



registry.category("actions").add("crm_modern.leads", Leads);

