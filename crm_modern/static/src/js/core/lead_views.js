import { _t } from "@web/core/l10n/translation";
import { session } from "@web/session";

const LEAD_STD_VIEWS = ["list", "kanban", "calendar", "pivot", "graph", "activity"];

/** View switcher entries for crm.lead pages: one modern view + every standard Odoo view. */
export function leadViewOptions(modern) {
    const std = [
        { value: "list", label: _t("List"), icon: "fa-list-ul" },
        { value: "kanban", label: _t("Kanban"), icon: "fa-columns" },
        { value: "calendar", label: _t("Calendar"), icon: "fa-calendar" },
        { value: "pivot", label: _t("Pivot"), icon: "fa-table" },
        { value: "graph", label: _t("Graph"), icon: "fa-bar-chart" },
        { value: "activity", label: _t("Activity"), icon: "fa-clock-o" },
    ];
    return modern ? [modern, ...std] : std;
}

/**
 * Props for <NativeView> showing leads or opportunities with Odoo's own views
 * (search bar with filters / group by / favorites, pager, export, actions).
 */
/** Odoo `views` + control-panel switcher entries for embedded crm.lead views. */
export function leadEmbeddedViews(viewIds, kind = "lead") {
    const views = [];
    const viewSwitcherEntries = [];
    for (const type of LEAD_STD_VIEWS) {
        const viewId = viewIds[`${kind}_${type}`];
        if (!viewId) {
            continue;
        }
        views.push([viewId, type]);
        const info = session.view_info[type] || {};
        viewSwitcherEntries.push({
            type,
            icon: info.icon || "oi-view-list",
            name: info.display_name || type,
            multiRecord: info.multiRecord !== false,
        });
    }
    const searchId = viewIds[`${kind}_search`];
    if (searchId) {
        views.push([searchId, "search"]);
    }
    return { views, viewSwitcherEntries };
}

export function leadNativeProps({ kind, view, viewIds, domain, campaignId, userId, onOpen, onCreate }) {
    const context = { default_type: kind };
    // Campaign / salesperson filters always apply, also on top of a page's own domain
    // ("Open leads" from a campaign used to show every lead).
    domain = domain ? [...domain] : [["type", "=", kind]];
    if (campaignId) {
        domain.push(["campaign_id", "=", Number(campaignId)]);
    }
    if (userId) {
        domain.push(["user_id", "=", Number(userId)]);
    }
    if (campaignId) {
        context.default_campaign_id = Number(campaignId);
    }
    return {
        resModel: "crm.lead",
        type: view,
        viewId: viewIds[`${kind}_${view}`] || false,
        searchViewId: viewIds[`${kind}_search`] || false,
        domain,
        context,
        onOpen,
        onCreate,
    };
}

export function readStoredView(key, fallback) {
    try {
        let view = window.localStorage.getItem(key) || fallback;
        if (view === "table") {
            view = "list";
        }
        return view;
    } catch {
        return fallback;
    }
}

export function storeView(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // storage unavailable
    }
}
