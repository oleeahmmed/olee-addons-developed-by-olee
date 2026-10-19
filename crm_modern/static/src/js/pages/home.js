/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registerModernHome } from "@modern_theme/js/modern_home";
import { loadFeatures } from "../core/features";

registerModernHome("crm_modern.home", {
    title: _t("CRM"),
    subtitle: _t("Jump to your everyday CRM screens."),
    cards: [
        { action: "crm_modern.action_pipeline", icon: "fa-filter", label: _t("Pipeline"), hint: _t("Board by stage") },
        { action: "crm_modern.action_leads", icon: "fa-user-plus", label: _t("Leads"), hint: _t("Qualify new contacts"), feature: "use_leads" },
        { action: "crm_modern.action_activities", icon: "fa-calendar-check-o", label: _t("Activities"), hint: _t("Calls and tasks") },
        { action: "crm_modern.action_campaigns", icon: "fa-bullhorn", label: _t("Campaigns"), hint: _t("Marketing sources") },
        { action: "crm_modern.action_dashboard", icon: "fa-th-large", label: _t("Dashboard"), hint: _t("KPIs and charts") },
    ],
    async filterCards(orm, cards) {
        const features = await loadFeatures(orm).catch(() => ({}));
        return cards.filter((card) => !card.feature || features[card.feature]);
    },
});
