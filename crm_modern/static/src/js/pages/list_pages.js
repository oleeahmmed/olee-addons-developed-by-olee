import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { CampaignDialog, QuickCreateDialog } from "../components/dialogs";
import { EmptyState } from "../components/ui";
import { NativeView } from "../components/native_view";
import { loadFeatures } from "../core/features";
import { openRecord } from "../core/utils";
import { readStoredView, storeView } from "../core/lead_views";
import { TeamDialog } from "./team_pages";

let viewIdsPromise = null;
/** View ids are the same for every page and every user: fetch them once per page load. */
function loadViewIds(orm) {
    viewIdsPromise ||= orm.call("crm.lead", "crm_modern_view_ids", []).catch((e) => {
        viewIdsPromise = null;
        throw e;
    });
    return viewIdsPromise;
}

/**
 * One list page = one card holding Odoo's own views (same design as Leads):
 * control panel with New + title, search (filters / group by / favorites),
 * pager, action menu / export and the view switcher, then the view itself.
 *
 * Subclasses only describe the model: views, domain, context and what
 * "open" / "new" should do.
 */
export class ListPage extends Component {
    static template = "crm_modern.ListPage";
    static components = { NativeView, EmptyState };
    static props = ["*"];

    // ---- page description (overridden by each page) ----
    static title = "";
    static resModel = "";
    static types = ["list"];
    static prefix = ""; // key prefix in crm_modern_view_ids, e.g. "campaign" → campaign_list
    static subtitle = ""; // one line under the title: what the page is for
    static icon = "";
    static newLabel = _t("New");
    /** Feature flag from crm.lead.crm_modern_features; the page stays empty when it is off. */
    static requiresFeature = null;
    static unavailableTitle = "";
    static unavailableDescription = "";
    get domain() {
        return [];
    }
    get context() {
        return {};
    }
    /** Return a promise to handle "open", or undefined for the Odoo form dialog. */
    open(resId) {
        return undefined;
    }
    /** Return a promise to handle "New", or undefined for the Odoo form dialog. */
    create() {
        return undefined;
    }

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.ctx = this.props.action?.context || {};
        const C = this.constructor;
        this.storageKey = `crm_modern.view.${C.prefix || C.resModel}`;
        let view = readStoredView(this.storageKey, C.types[0]);
        if (!C.types.includes(view)) {
            view = C.types[0];
        }
        this.state = useState({ ready: false, view, viewIds: {}, version: 0, canCreate: false, unavailable: false });
        onWillStart(async () => {
            const [viewIds, features] = await Promise.all([
                loadViewIds(this.orm),
                C.requiresFeature ? loadFeatures(this.orm).catch(() => ({})) : {},
            ]);
            const unavailable = Boolean(C.requiresFeature && !features[C.requiresFeature]);
            const canCreate = unavailable
                ? false
                : await user.checkAccessRight(C.resModel, "create").catch(() => false);
            Object.assign(this.state, { viewIds, canCreate, unavailable, ready: true });
        });
    }

    get page() {
        return this.constructor;
    }
    /** The action's name when it carries one (e.g. "Pipeline · Web Sales BD" from a team card). */
    get pageTitle() {
        return this.props.action?.display_name || this.constructor.title;
    }
    get canCreate() {
        return this.state.canCreate;
    }
    onNew() {
        return this.create() || this.openForm(false);
    }

    viewId(type) {
        const p = this.constructor.prefix;
        return (p && this.state.viewIds[`${p}_${type}`]) || false;
    }

    get nativeProps() {
        const C = this.constructor;
        const views = C.types.map((type) => [this.viewId(type), type]);
        views.push([this.viewId("search"), "search"]);
        const viewSwitcherEntries = C.types.map((type) => {
            const info = session.view_info?.[type] || {};
            return { type, icon: info.icon || "oi-view-list", name: info.display_name || type, multiRecord: true };
        });
        return {
            resModel: C.resModel,
            type: this.state.view,
            viewId: this.viewId(this.state.view),
            searchViewId: this.viewId("search"),
            views,
            viewSwitcherEntries,
            displayName: String(this.pageTitle),
            domain: this.domain,
            context: this.context,
            formViewId: this.viewId("form"),
            onSwitchView: (type) => this.setView(type),
            onOpen: (resId) => this.open(resId) || this.openForm(resId),
            onCreate: () => this.onNew(),
        };
    }

    setView(view) {
        this.state.view = view;
        storeView(this.storageKey, view);
    }
    refresh() {
        this.state.version++;
    }
    openForm(resId) {
        return new Promise((resolve) =>
            this.action.doAction(
                {
                    type: "ir.actions.act_window",
                    res_model: this.constructor.resModel,
                    res_id: resId || false,
                    views: [[this.viewId("form"), "form"]],
                    target: "new",
                    context: this.context,
                },
                { onClose: resolve }
            )
        ).then(() => this.refresh());
    }
    dialogPromise(Component, props) {
        return new Promise((resolve) => this.dialog.add(Component, props, { onClose: resolve })).then(() => this.refresh());
    }
}

// --------------------------------------------------------------------------- pages

class PipelinePage extends ListPage {
    static title = _t("Pipeline");
    static subtitle = _t("Every open deal, stage by stage — drag a card to move it");
    static icon = "fa-columns";
    static newLabel = _t("New opportunity");
    static resModel = "crm.lead";
    static prefix = "opportunity";
    static types = ["kanban", "list", "calendar", "pivot", "graph", "activity"];
    get domain() {
        const d = [["type", "=", "opportunity"]];
        if (this.ctx.crm_modern_campaign_id) {
            d.push(["campaign_id", "=", Number(this.ctx.crm_modern_campaign_id)]);
        }
        if (this.ctx.crm_modern_user_id) {
            d.push(["user_id", "=", Number(this.ctx.crm_modern_user_id)]);
        }
        if (this.ctx.crm_modern_team_id) {
            d.push(["team_id", "=", Number(this.ctx.crm_modern_team_id)]);
        }
        return d;
    }
    get context() {
        const c = { default_type: "opportunity" };
        if (this.ctx.crm_modern_campaign_id) {
            c.default_campaign_id = Number(this.ctx.crm_modern_campaign_id);
        }
        if (this.ctx.crm_modern_team_id) {
            c.default_team_id = Number(this.ctx.crm_modern_team_id);
        }
        return c;
    }
    open(resId) {
        return openRecord(this.action, resId);
    }
    create() {
        return this.dialogPromise(QuickCreateDialog, {
            type: "opportunity",
            defaults: {
                campaign_id: this.ctx.crm_modern_campaign_id || "",
                team_id: this.ctx.crm_modern_team_id || "",
            },
        });
    }
}

class CampaignsPage extends ListPage {
    static title = _t("Campaigns");
    static subtitle = _t("Your campaigns — open one to see the leads and deals it brought in");
    static icon = "fa-bullhorn";
    static newLabel = _t("New campaign");
    static resModel = "utm.campaign";
    static prefix = "campaign";
    static types = ["kanban", "list"];
    create() {
        return this.dialogPromise(CampaignDialog, {});
    }
}

class TeamsPage extends ListPage {
    static title = _t("Sales Teams");
    static subtitle = _t("Leaders, salespeople and results — edit members right on the cards");
    static icon = "fa-users";
    static newLabel = _t("New team");
    static resModel = "crm.team";
    static prefix = "team";
    static types = ["kanban", "list"];
    open(resId) {
        return this.action.doAction("crm_modern.action_team", { additionalContext: { active_id: resId } });
    }
    async create() {
        const users = await this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" });
        return this.dialogPromise(TeamDialog, {
            users,
            onSaved: (id) => this.action.doAction("crm_modern.action_team", { additionalContext: { active_id: id } }),
        });
    }
}

class SalespeoplePage extends ListPage {
    static title = _t("Salespeople");
    static subtitle = _t("Who sells in which team, and how many leads they can take");
    static icon = "fa-user";
    static newLabel = _t("Add salesperson");
    static resModel = "crm.team.member";
    static prefix = "member";
    static types = ["list", "kanban"];
}

class ActivitiesPage extends ListPage {
    static title = _t("Activities");
    static subtitle = _t("Calls, meetings and to-dos on your leads and opportunities");
    static icon = "fa-clock-o";
    static newLabel = _t("Schedule activity");
    static resModel = "mail.activity";
    static prefix = "activity";
    static types = ["list", "kanban", "calendar"];
    get domain() {
        return [["res_model", "=", "crm.lead"]];
    }
    async open(resId) {
        const [act] = await this.orm.read("mail.activity", [resId], ["res_model", "res_id"]);
        if (act?.res_model === "crm.lead") {
            return openRecord(this.action, act.res_id);
        }
        return this.openForm(resId);
    }
    create() {
        // Odoo's schedule wizard: pick the lead / opportunity, the type, or a whole activity plan.
        return new Promise((resolve) =>
            this.action.doAction(
                {
                    type: "ir.actions.act_window",
                    name: _t("Schedule Activity"),
                    res_model: "mail.activity.schedule",
                    views: [[false, "form"]],
                    target: "new",
                    context: { active_model: "crm.lead", dialog_size: "large" },
                },
                { onClose: resolve }
            )
        ).then(() => this.refresh());
    }
}

class StagesPage extends ListPage {
    static title = _t("Pipeline Stages");
    static subtitle = _t("The steps a deal goes through, in order");
    static icon = "fa-list-ol";
    static newLabel = _t("New stage");
    static resModel = "crm.stage";
    static prefix = "stage";
    static types = ["list"];
}

class ActivityTypesPage extends ListPage {
    static title = _t("Activity Types");
    static subtitle = _t("Call, email, meeting… and what each one suggests next");
    static icon = "fa-th";
    static newLabel = _t("New activity type");
    static resModel = "mail.activity.type";
    static prefix = "atype";
    static types = ["list", "kanban"];
    get domain() {
        return [["res_model", "in", [false, "crm.lead"]]];
    }
    get context() {
        return { default_res_model: "crm.lead" };
    }
}

class ActivityPlansPage extends ListPage {
    static title = _t("Activity Plans");
    static subtitle = _t("Ready-made sequences of activities to launch in one click");
    static icon = "fa-tasks";
    static newLabel = _t("New plan");
    static resModel = "mail.activity.plan";
    static prefix = "plan";
    static types = ["list", "kanban"];
    get domain() {
        return [["res_model", "in", [false, "crm.lead"]]];
    }
    get context() {
        return { default_res_model: "crm.lead", dialog_size: "large" };
    }
}

class TagsPage extends ListPage {
    static title = _t("Tags");
    static subtitle = _t("Labels to sort and filter leads and opportunities");
    static icon = "fa-tags";
    static newLabel = _t("New tag");
    static resModel = "crm.tag";
    static prefix = "tag";
    static types = ["list"];
}

const actions = registry.category("actions");
actions.add("crm_modern.pipeline", PipelinePage);
actions.add("crm_modern.campaigns", CampaignsPage);
actions.add("crm_modern.teams", TeamsPage);
actions.add("crm_modern.salespeople", SalespeoplePage);
actions.add("crm_modern.activities", ActivitiesPage);
actions.add("crm_modern.stages", StagesPage);
actions.add("crm_modern.activity_types", ActivityTypesPage);
actions.add("crm_modern.activity_plans", ActivityPlansPage);
actions.add("crm_modern.tags", TagsPage);
