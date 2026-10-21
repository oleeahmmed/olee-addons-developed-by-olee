import { Component, onWillUpdateProps, useState, useSubEnv } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { View, getDefaultConfig } from "@web/views/view";

/**
 * Embeds a standard Odoo view (list, kanban, calendar, pivot, graph, activity)
 * inside a modern page: Odoo's own search bar (filters, group by, favorites),
 * sorting, pager, multi-record actions and export all keep working.
 *
 * Opening / creating records is routed through onOpen / onCreate so that
 * leads go to the modern record page, teams to the team page, and so on.
 * Without them, the record's Odoo form opens in a dialog.
 */
export class NativeView extends Component {
    static template = "crm_modern.NativeView";
    static components = { View };
    static props = {
        resModel: String,
        type: String,
        viewId: { type: [Number, Boolean], optional: true },
        searchViewId: { type: [Number, Boolean], optional: true },
        domain: { type: Array, optional: true },
        context: { type: Object, optional: true },
        onOpen: { type: Function, optional: true }, // (resId) => void
        onCreate: { type: Function, optional: true }, // () => Promise|void
        views: { type: Array, optional: true },
        viewSwitcherEntries: { type: Array, optional: true },
        onSwitchView: { type: Function, optional: true },
        displayName: { type: String, optional: true },
        formViewId: { type: [Number, Boolean], optional: true },
        noContentHelp: { type: [String, Object], optional: true },
    };

    setup() {
        this.action = useService("action");
        this.state = useState({ version: 1 });
        useSubEnv({
            config: {
                ...getDefaultConfig(),
                ...(this.env.config || {}),
            },
        });
        this.syncEmbeddedConfig(this.props);
        onWillUpdateProps((next) => this.syncEmbeddedConfig(next));
    }

    syncEmbeddedConfig(props) {
        const entries = (props.viewSwitcherEntries || []).map((entry) => ({
            ...entry,
            active: entry.type === props.type,
        }));
        Object.assign(this.env.config, {
            views: props.views || [],
            viewSwitcherEntries: entries,
            viewType: props.type,
            crmModernSwitchView: props.onSwitchView,
        });
        if (props.displayName) {
            this.env.config.setDisplayName(props.displayName);
        }
    }

    /** Re-mount the view so it reloads its records (after a dialog closed, etc.). */
    refresh() {
        this.state.version++;
    }

    openFormDialog(resId) {
        return new Promise((resolve) =>
            this.action.doAction(
                {
                    type: "ir.actions.act_window",
                    name: this.props.displayName || "",
                    res_model: this.props.resModel,
                    res_id: resId || false,
                    views: [[this.props.formViewId || false, "form"]],
                    target: "new",
                    context: this.props.context || {},
                },
                { onClose: resolve }
            )
        ).then(() => this.refresh());
    }

    get viewProps() {
        const p = this.props;
        return {
            resModel: p.resModel,
            type: p.type,
            viewId: p.viewId || false,
            views: p.views,
            searchViewId: p.searchViewId || false,
            domain: p.domain || [],
            context: p.context || {},
            display: { controlPanel: {} },
            loadIrFilters: true,
            loadActionMenus: true,
            useSampleModel: false,
            className: "o_cm_native_view",
            noContentHelp: p.noContentHelp,
            selectRecord: (resId) => (p.onOpen ? p.onOpen(resId) : this.openFormDialog(resId)),
            createRecord: async () => {
                if (p.onCreate) {
                    await p.onCreate();
                    this.refresh();
                } else {
                    await this.openFormDialog(false);
                }
            },
        };
    }
}
