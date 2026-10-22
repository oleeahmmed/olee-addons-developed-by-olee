import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { CampaignDialog, QuickCreateDialog } from "../components/dialogs";
import { ActivityPlanDialog, ActivityTypeDialog, LostReasonDialog, MemberDialog, StageDialog, TagDialog, UserDialog } from "../components/config_dialogs";
import { TeamDialog } from "../pages/team_pages";

/**
 * Modern CRM inside the global Modern Theme sidebar.
 *
 * Modern Theme 3.x draws one sidebar for every app (classic tree, icon rail +
 * panel, floating glass). CRM only describes how its menu is organised: group
 * order, which Odoo CRM menus are replaced by a modern page, icons, what the
 * "+ New" button creates on each page, counters and the records Ctrl+K finds.
 * Menus still come from ir.ui.menu, so Odoo's groups decide what each user sees.
 */
const APP_XMLID = "crm.crm_menu_root";
const OWN_PREFIXES = ["crm_modern."];
// Odoo / CRM Simple top-level menus whose entries go into one of our groups
const MERGE_INTO = {
    "crm.crm_menu_report": "crm_modern.menu_reporting",
    "crm.crm_menu_config": "crm_modern.menu_config",
};
const SIDEBAR_ORDER = [
    "crm_modern.menu_home",
    "crm_modern.menu_marketing",
    "crm_modern.menu_sales",
    "crm_modern.menu_users",
];
const GROUP_CHILD_ORDER = {
    "crm_modern.menu_marketing": [
        "crm_modern.menu_campaigns",
        "crm_modern.menu_leads",
        "crm_modern.menu_pipeline",
        "crm_modern.menu_activities",
    ],
    "crm_modern.menu_sales": [
        "crm_modern.menu_quotations",
        "crm_modern.menu_sale_orders",
        "crm_modern.menu_customers",
        "crm_modern.menu_dashboard",
    ],
    "crm_modern.menu_team": [
        "crm_modern.menu_teams",
        "crm_modern.menu_salespeople",
    ],
    "crm_modern.menu_config": [
        "crm_modern.menu_general_settings",
        "crm_modern.menu_settings",
        "crm_modern.menu_company",
        "crm_modern.menu_stages",
        "crm_modern.menu_activity_types",
        "crm_modern.menu_activity_plans",
        "crm_modern.menu_tags",
        "crm_modern.menu_lost_reasons",
    ],
};
// In the top bar, not the sidebar: Team and Users (under "More"), Reporting, Configuration.
const TOP_GROUPS = new Set(["crm_modern.menu_team", "crm_modern.menu_users", "crm_modern.menu_reporting", "crm_modern.menu_config"]);
// Odoo entries replaced by a Modern CRM page / menu on the same records
const REPLACED = new Set([
    "crm.menu_crm_opportunities",
    "crm.crm_menu_leads",
    "crm.crm_lead_menu_my_activities",
    "crm.sales_team_menu_team_pipeline",
    "crm.crm_team_config",
    "crm.crm_team_member_config",
    "crm.crm_team_menu_config_activity_types",
    "crm.mail_activity_plan_menu_config_lead",
    "crm.menu_crm_lead_stage_act",
    "crm.menu_crm_lead_categ",
    "crm.menu_crm_lost_reason",
    "crm.crm_config_settings_menu",
    "crm.crm_menu_forecast",
    "crm.crm_opportunity_report_menu",
    "crm.crm_opportunity_report_menu_lead",
    "crm.crm_activity_report_menu",
    "sale_crm.sale_order_menu_quotations_crm",
    "crm.res_partner_menu_customer",
]);

/** Font Awesome icon per menu xmlid (Odoo ships FA 4.7). Other addons may add entries. */
export const menuIcons = registry.category("crm_modern.menu_icons");
for (const [xmlid, icon] of Object.entries({
    "crm_modern.menu_home": "fa-sun-o",
    "crm_modern.menu_dashboard": "fa-th-large",
    "crm_modern.menu_pipeline": "fa-columns",
    "crm_modern.menu_leads": "fa-user-plus",
    "crm_modern.menu_activities": "fa-clock-o",
    "crm_modern.menu_campaigns": "fa-bullhorn",
    "crm_modern.menu_salespeople": "fa-user",
    "crm_modern.menu_users": "fa-user-circle",
    "crm_modern.menu_teams": "fa-users",
    "crm_modern.menu_company": "fa-building-o",
    "crm_modern.menu_general_settings": "fa-sliders",
    "crm_modern.menu_stages": "fa-list-ol",
    "crm_modern.menu_activity_types": "fa-th",
    "crm_modern.menu_activity_plans": "fa-tasks",
    "crm_modern.menu_tags": "fa-tags",
    "crm_modern.menu_settings": "fa-cog",
    "crm_modern.menu_lost_reasons": "fa-ban",
    "crm_modern.menu_customers": "fa-address-book-o",
    "crm_modern.menu_forecast": "fa-line-chart",
    "crm_modern.menu_report_pipeline": "fa-bar-chart",
    "crm_modern.menu_report_leads": "fa-pie-chart",
    "crm_modern.menu_report_activities": "fa-area-chart",
    // Odoo's own CRM menus
    "crm.menu_crm_opportunities": "fa-columns",
    "crm.crm_lead_menu_my_activities": "fa-clock-o",
    "crm.sales_team_menu_team_pipeline": "fa-users",
    "crm.res_partner_menu_customer": "fa-address-book-o",
    "crm.crm_menu_leads": "fa-user-plus",
    "crm.crm_menu_forecast": "fa-line-chart",
    "crm.crm_opportunity_report_menu": "fa-bar-chart",
    "crm.crm_opportunity_report_menu_lead": "fa-pie-chart",
    "crm.crm_activity_report_menu": "fa-area-chart",
    "crm.crm_config_settings_menu": "fa-cog",
    "crm.crm_team_config": "fa-users",
    "crm.crm_team_member_config": "fa-user",
    "crm.crm_team_menu_config_activity_types": "fa-th",
    "crm.mail_activity_plan_menu_config_lead": "fa-tasks",
    "crm.crm_recurring_plan_menu_config": "fa-repeat",
    "crm.menu_crm_lead_stage_act": "fa-list-ol",
    "crm.menu_crm_lead_categ": "fa-tags",
    "crm.menu_crm_lost_reason": "fa-ban",
    "sale_crm.sale_order_menu_quotations_crm": "fa-file-text-o",
    // CRM Simple
})) {
    menuIcons.add(xmlid, icon);
}

/**
 * What the sidebar's "+" button creates, one entry per page: the model behind
 * the page you are on and the label shown on the button.
 */
export const createTargets = registry.category("crm_modern.create_targets");
for (const [xmlid, spec] of Object.entries({
    "crm_modern.menu_pipeline": { resModel: "crm.lead", label: _t("New opportunity"), context: { default_type: "opportunity" } },
    "crm_modern.menu_activities": { resModel: "mail.activity", label: _t("Schedule activity"), schedule: true },
    "crm_modern.menu_leads": { resModel: "crm.lead", label: _t("New lead"), context: { default_type: "lead" } },
    "crm_modern.menu_campaigns": { resModel: "utm.campaign", label: _t("New campaign") },
    "crm_modern.menu_quotations": { resModel: "sale.order", label: _t("New quotation") },
    "crm_modern.menu_sale_orders": { resModel: "sale.order", label: _t("New sales order") },
    "crm_modern.menu_salespeople": { resModel: "crm.team.member", label: _t("New salesperson") },
    "crm_modern.menu_users": { resModel: "res.users", label: _t("New user") },
    "crm_modern.menu_teams": { resModel: "crm.team", label: _t("New sales team") },
    "crm_modern.menu_stages": { resModel: "crm.stage", label: _t("New stage") },
    "crm_modern.menu_activity_types": { resModel: "mail.activity.type", label: _t("New activity type") },
    "crm_modern.menu_activity_plans": { resModel: "mail.activity.plan", label: _t("New activity plan") },
    "crm_modern.menu_tags": { resModel: "crm.tag", label: _t("New tag") },
    "crm_modern.menu_lost_reasons": { resModel: "crm.lost.reason", label: _t("New lost reason") },
    "crm_modern.menu_customers": { resModel: "res.partner", label: _t("New customer"), context: { res_partner_search_mode: "customer" } },
})) {
    createTargets.add(xmlid, spec);
}
/** Page the "+" falls back to when the current page has nothing to create. */
const DEFAULT_CREATE = "crm_modern.menu_pipeline";
/** Models a page shows but that are not created on their own (e.g. activities need a record). */
const NO_CREATE = new Set(["mail.activity"]);


/** Custom create dialogs per model (anything else opens Odoo's own form). */
const CREATE_DIALOGS = {
    "utm.campaign": CampaignDialog,
    "crm.stage": StageDialog,
    "mail.activity.type": ActivityTypeDialog,
    "mail.activity.plan": ActivityPlanDialog,
    "crm.tag": TagDialog,
    "crm.team.member": MemberDialog,
    "crm.lost.reason": LostReasonDialog,
    "crm.team": TeamDialog,
    "res.users": UserDialog,
};

async function onCreate(spec, env) {
    const reload = () => env.bus.trigger("crm_modern:list-reload");
    const context = { ...(spec.context || {}) };
    if (spec.schedule) {
        await env.services.action.doAction(
            {
                type: "ir.actions.act_window",
                name: _t("Schedule Activity"),
                res_model: "mail.activity.schedule",
                views: [[false, "form"]],
                target: "new",
                context: { active_model: "crm.lead", dialog_size: "large" },
            },
            { onClose: reload }
        );
        return true;
    }
    if (spec.resModel === "crm.lead") {
        env.services.dialog.add(QuickCreateDialog, {
            type: context.default_type === "lead" ? "lead" : "opportunity",
            defaults: context,
            onSaved: reload,
        });
        return true;
    }
    const Dialog = CREATE_DIALOGS[spec.resModel];
    if (Dialog) {
        env.services.dialog.add(Dialog, { onSaved: reload });
        return true;
    }
    return false;
}

registry.category("modern_theme.sidebar_apps").add(APP_XMLID, {
    legacyPrefix: "cm",
    ownPrefixes: OWN_PREFIXES,
    mergeInto: MERGE_INTO,
    replaced: REPLACED,
    secondary: TOP_GROUPS,
    order: SIDEBAR_ORDER,
    childOrder: GROUP_CHILD_ORDER,
    icons: menuIcons,
    createTargets,
    defaultCreate: DEFAULT_CREATE,
    noCreate: NO_CREATE,
    onCreate,
});

// ---------------------------------------------------------------------------
// Counters next to menus (refreshed when the CRM app opens, at most every minute)
// ---------------------------------------------------------------------------
const badges = registry.category("modern_theme.menu_badges");
function todayEnd() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// My activities that are late or due today.
badges.add("crm_modern.menu_activities", (env) =>
    env.services.orm.searchCount("mail.activity", [
        ["res_model", "=", "crm.lead"],
        ["user_id", "=", user.userId],
        ["date_deadline", "<=", todayEnd()],
    ])
);
// Leads nobody owns yet.
badges.add("crm_modern.menu_leads", (env) =>
    env.services.orm.searchCount("crm.lead", [
        ["type", "=", "lead"],
        ["user_id", "=", false],
    ])
);

// ---------------------------------------------------------------------------
// Records the Ctrl+K palette can find
// ---------------------------------------------------------------------------
const paletteModels = registry.category("modern_theme.palette_models");
paletteModels.add("crm.lead", { label: _t("Opportunity / lead"), icon: "fa-handshake-o", limit: 5 });
paletteModels.add("utm.campaign", { label: _t("Campaign"), icon: "fa-bullhorn", limit: 3 });
paletteModels.add("sale.order", { label: _t("Quotation / order"), icon: "fa-file-text-o", limit: 4 });
