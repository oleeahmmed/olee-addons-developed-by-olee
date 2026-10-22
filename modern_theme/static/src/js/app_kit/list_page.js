import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";
import { NativeView as AppNativeView } from "./native_view";

const viewIdsPromises = {};
/**
 * View ids are the same for every page and every user: fetch them once per page load.
 * `source` = { model, method }: a model method returning { "<prefix>_<type>": viewId }.
 */
export function loadViewIds(orm, source) {
    if (!source) {
        return Promise.resolve({});
    }
    const key = `${source.model}.${source.method}`;
    viewIdsPromises[key] ||= orm.call(source.model, source.method, []).catch((e) => {
        delete viewIdsPromises[key];
        throw e;
    });
    return viewIdsPromises[key];
}

function readStoredView(key, fallback) {
    try {
        return window.localStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}
function storeView(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // storage unavailable (private window...)
    }
}

/** Open a record in Odoo's own full form (all buttons, smart buttons, chatter...). */
export function openFullForm(action, resModel, resId, { viewId = false, context = {} } = {}) {
    return action.doAction({
        type: "ir.actions.act_window",
        res_model: resModel,
        res_id: resId || false,
        views: [[viewId, "form"]],
        target: "current",
        context,
    });
}

/**
 * One list page = page header (title, purpose, "+ New …") and one card holding
 * Odoo's own views: control panel with search (filters / group by / favorites),
 * pager, action menu / export and the view switcher, then the view itself.
 * Subclasses only describe the model, its views, domain, context and what
 * "open" / "new" do.
 */
export class ListPage extends Component {
    static template = "modern_theme.AppListPage";
    static components = { AppNativeView };
    static props = ["*"];

    static title = "";
    static subtitle = "";
    static icon = "";
    static newLabel = _t("New");
    static resModel = "";
    static types = ["list"];
    static cssPrefix = "mk"; // the app's class prefix: .o_ss, .ss-card…
    static storagePrefix = "modern"; // remembered view type: "<storagePrefix>.view.<prefix>"
    static viewIds = null; // { model, method } returning the app's view ids
    static prefix = ""; // key prefix in those view ids, e.g. "order" → order_list
    static allowCreate = true;
    static emptyTitle = ""; // empty-list help, as in Odoo's own actions
    static emptyText = "";

    get domain() {
        return [];
    }
    get context() {
        return {};
    }
    open(resId) {
        return openFullForm(this.action, this.constructor.resModel, resId, { viewId: this.viewId("form") });
    }
    /** Add, view and edit all use the same full Odoo form, so they look the same. */
    create() {
        return openFullForm(this.action, this.constructor.resModel, false, {
            viewId: this.viewId("form"),
            context: this.context,
        });
    }

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.ctx = this.props.action?.context || {};
        const C = this.constructor;
        this.storageKey = C.viewKey || `${C.storagePrefix}.view.${C.prefix || C.resModel}`;
        let view = readStoredView(this.storageKey, C.types[0]);
        if (!C.types.includes(view)) {
            view = C.types[0];
        }
        this.state = useState({ ready: false, view, viewIds: {}, version: 0, canCreate: false });
        onWillStart(async () => {
            const [viewIds, canCreate] = await Promise.all([
                loadViewIds(this.orm, C.viewIds).catch(() => ({})),
                C.allowCreate ? user.checkAccessRight(C.resModel, "create").catch(() => false) : false,
            ]);
            Object.assign(this.state, { viewIds, canCreate, ready: true });
        });
    }

    get page() {
        return this.constructor;
    }
    get pageTitle() {
        return this.props.action?.display_name || this.constructor.title;
    }
    get canCreate() {
        return this.state.canCreate;
    }
    onNew() {
        return this.create();
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
            cssPrefix: C.cssPrefix,
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
            onOpen: (resId) => this.open(resId),
            onCreate: () => this.onNew(),
            noContentHelp: C.emptyTitle ? this.emptyHelp(C.emptyTitle, C.emptyText) : undefined,
        };
    }

    emptyHelp(title, text) {
        const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<p class="o_view_nocontent_smiling_face">${esc(title)}</p><p>${esc(text)}</p>`;
    }
    setView(view) {
        this.state.view = view;
        storeView(this.storageKey, view);
    }
    refresh() {
        this.state.version++;
    }
}
