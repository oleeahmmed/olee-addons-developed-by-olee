import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { KanbanController } from "@web/views/kanban/kanban_controller";
import { ListController } from "@web/views/list/list_controller";
import { findDrawerForm, openSmartDrawer } from "./smart_drawer";

/**
 * Every list (and kanban, when the description says kanban: true) of a model with a smart-drawer description (drawer_specs.js and
 * the app addons) opens and creates its records in the drawer instead of Odoo's form:
 * Configuration menus of every app, the shop addons' lists, and so on.
 * Left alone: lists inside a dialog (many2one "Search more…"), and the modern pages'
 * embedded views (their page decides what "open" does — see app_kit/list_page.js).
 */
function drawerFormFor(controller, { kanban = false } = {}) {
    const props = controller.props;
    if (controller.env.inDialog || (props.className || "").includes("_native_view")) {
        return null;
    }
    const spec = findDrawerForm(props.resModel, props.context);
    // kanbans are often dashboards (journals, operation types, work centres): only when asked
    return spec && (!kanban || spec.kanban) ? spec : null;
}

/** A fresh object literal per controller class, so `super` binds to that class. */
function drawerPatch({ list = false, kanban = false } = {}) {
    return {
        setup() {
            super.setup(...arguments);
            this.mtDialog = useService("dialog");
            this.mtDrawerForm = drawerFormFor(this, { kanban });
            if (list && this.mtDrawerForm && this.mtDrawerForm.open !== false) {
                // a row click opens the drawer instead of editing the row in place
                this.editable = false;
                this.hasOpenFormViewButton = false;
            }
        },
        async mtOpenDrawer(resId) {
            await openSmartDrawer(this.mtDialog, this.mtDrawerForm, {
                resModel: this.props.resModel,
                resId,
                context: this.props.context || {},
            });
            await this.model.root.load();
            this.model.useSampleModel = false;
            this.render(true);
        },
        async openRecord(record, options = {}) {
            // open: false = only "New" uses the drawer (e.g. a shop: its settings are a whole page)
            if (this.mtDrawerForm && this.mtDrawerForm.open !== false && !options.newWindow) {
                return this.mtOpenDrawer(record.resId);
            }
            return super.openRecord(...arguments);
        },
        async createRecord() {
            if (this.mtDrawerForm) {
                return this.mtOpenDrawer(false);
            }
            return super.createRecord(...arguments);
        },
    };
}

patch(ListController.prototype, drawerPatch({ list: true }));
patch(KanbanController.prototype, drawerPatch({ kanban: true }));

/**
 * Simple forms opened in a dialog by an action (a button "+ New Shop", a server method
 * returning { target: "new", views: [[…, "form"]] }…) open in the drawer instead, when
 * the model has a description. Wizards and anything else keep Odoo's dialog.
 */
const servicesRegistry = registry.category("services");
const actionServiceDef = servicesRegistry.get("action");
servicesRegistry.add(
    "action",
    {
        ...actionServiceDef,
        start(env, deps) {
            const service = actionServiceDef.start.call(this, env, deps);
            const doAction = service.doAction;
            service.doAction = async function (action, options = {}) {
                const spec = drawerFormForAction(action);
                if (spec) {
                    await openSmartDrawer(env.services.dialog, spec, {
                        resModel: action.res_model,
                        resId: action.res_id || false,
                        context: action.context || {},
                    });
                    await options.onClose?.();
                    return;
                }
                return doAction.call(this, action, options);
            };
            return service;
        },
    },
    { force: true }
);

function drawerFormForAction(action) {
    if (!action || typeof action !== "object" || action.type !== "ir.actions.act_window" || action.target !== "new") {
        return null;
    }
    const views = action.views || (action.view_mode || "").split(",").filter(Boolean).map((type) => [false, type.trim()]);
    if (!views.length || views.some(([, type]) => type !== "form") || typeof action.context === "string") {
        return null;
    }
    const spec = findDrawerForm(action.res_model, action.context || {});
    if (!spec || spec.dialog === false || (action.res_id && spec.open === false)) {
        return null;
    }
    return spec;
}
