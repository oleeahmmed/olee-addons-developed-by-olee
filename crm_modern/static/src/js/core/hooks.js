import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { MarkDoneDialog } from "../components/dialogs";
import { openInDialog, openRecord } from "./utils";

export const ACTIVITY_FIELDS = ["summary", "note", "activity_type_id", "date_deadline", "user_id", "res_id", "res_model", "res_name", "state"];
export const ACTIVITY_TYPE_FIELDS = ["name", "icon", "category", "decoration_type", "res_model", "sequence"];

export async function loadActivityTypes(orm) {
    const types = await orm.searchRead("mail.activity.type", [], ACTIVITY_TYPE_FIELDS, {
        context: { active_test: false },
    });
    return Object.fromEntries(types.map((t) => [t.id, t]));
}

/**
 * Activity actions shared by every page. All of them go through Odoo's own
 * mail.activity / mail.activity.schedule so chaining and plans behave as in Odoo.
 */
export function useActivityActions(reload) {
    const action = useService("action");
    const dialog = useService("dialog");
    const orm = useService("orm");
    const notification = useService("notification");

    return {
        /** Odoo's schedule wizard: pick a type, or launch an activity plan. */
        schedule(resIds, resModel = "crm.lead") {
            return openInDialog(action, {
                type: "ir.actions.act_window",
                name: resIds.length > 1 ? _t("Schedule Activity On Selected Records") : _t("Schedule Activity"),
                res_model: "mail.activity.schedule",
                views: [[false, "form"]],
                target: "new",
                context: { active_model: resModel, active_ids: resIds, active_id: resIds[0], dialog_size: "large" },
            }).then(reload);
        },
        markDone(activity, type) {
            dialog.add(MarkDoneDialog, {
                activity,
                type,
                onDone: async (next) => {
                    if (next) {
                        await openInDialog(action, next);
                    }
                    reload();
                },
            });
        },
        edit(activityId) {
            return openInDialog(action, {
                type: "ir.actions.act_window",
                name: _t("Edit activity"),
                res_model: "mail.activity",
                res_id: activityId,
                views: [[false, "form"]],
                target: "new",
            }).then(reload);
        },
        async cancel(activityId) {
            await orm.unlink("mail.activity", [activityId]);
            notification.add(_t("Activity cancelled"), { type: "info" });
            reload();
        },
    };
}

/** Navigation + standard CRM wizards for crm.lead records. */
export function useLeadActions(reload) {
    const action = useService("action");
    const orm = useService("orm");
    const effect = useService("effect");

    return {
        open(id) {
            return openRecord(action, id);
        },
        openForm(id) {
            return action.doAction({
                type: "ir.actions.act_window",
                res_model: "crm.lead",
                res_id: id,
                views: [[false, "form"]],
            });
        },
        async won(id) {
            const result = await orm.call("crm.lead", "action_set_won_rainbowman", [[id]]);
            if (result && result.effect) {
                effect.add(result.effect);
            }
            reload();
        },
        lost(ids) {
            return new Promise((resolve) =>
                action.doAction("crm.crm_lead_lost_action", {
                    additionalContext: { active_model: "crm.lead", active_ids: ids, active_id: ids[0] },
                    onClose: resolve,
                })
            ).then(reload);
        },
        async restore(ids) {
            await orm.call("crm.lead", "action_unarchive", [ids]);
            reload();
        },
        convert(ids) {
            const xmlid = ids.length > 1 ? "crm.action_crm_send_mass_convert" : "crm.action_crm_lead2opportunity_partner";
            return new Promise((resolve) =>
                action.doAction(xmlid, {
                    additionalContext: { active_model: "crm.lead", active_ids: ids, active_id: ids[0] },
                    onClose: resolve,
                })
            ).then(reload);
        },
    };
}
