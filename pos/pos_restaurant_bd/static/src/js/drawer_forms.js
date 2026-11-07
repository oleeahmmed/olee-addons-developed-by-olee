import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "@modern_theme/js/app_kit/smart_drawer";

drawerForms.add("pos.rb.staff", {
    title: _t("Waiter / rider"),
    newTitle: _t("New waiter or rider"),
    subtitle: _t("Picked on the bill at the counter; the day-end report shows each one's sales."),
    fields: [
        { name: "name", placeholder: _t("e.g. Rahim") },
        "kind",
        "phone",
        { name: "config_ids", label: _t("Shops"), widget: "chips" },
        "active",
    ],
});
