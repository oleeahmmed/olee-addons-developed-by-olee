import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "@modern_theme/js/app_kit/smart_drawer";

drawerForms.add("pos.bk.cake", {
    title: _t("Cake order"),
    newTitle: _t("New cake order"),
    subtitle: _t("Take the advance and deliver from the bakery counter (Cakes button)."),
    fields: [
        ["product_id", { name: "config_id", label: _t("Shop"), domain: [["bk_bakery", "=", true]] }],
        ["flavour", "weight"],
        "message",
        "note",
        "delivery_at",
        { section: _t("Customer"), icon: "fa-user" },
        "partner_id",
        ["customer_name", "phone"],
        { section: _t("Money"), icon: "fa-money" },
        ["price_total", { name: "advance", readonly: true }],
        { name: "state", readonly: true },
    ],
});
