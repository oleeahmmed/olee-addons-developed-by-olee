import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "@modern_theme/js/app_kit/smart_drawer";

drawerForms.add("pos.bd.offer", {
    title: _t("Offer"),
    newTitle: _t("New offer"),
    subtitle: _t("Applied by itself at the counter while it runs."),
    fields: [
        { name: "name", placeholder: _t("e.g. Eid offer 10%") },
        { name: "kind", widget: "cards" },
        { name: "percent", visible: (v) => v.kind === "percent" },
        [
            { name: "buy_qty", visible: (v) => v.kind === "bogo" },
            { name: "get_qty", visible: (v) => v.kind === "bogo" },
        ],
        [
            { name: "min_amount", visible: (v) => v.kind === "bill" },
            { name: "amount", visible: (v) => v.kind === "bill" },
        ],
        { section: _t("Which products"), icon: "fa-cube", text: _t("Nothing picked = every product.") },
        { name: "pos_categ_ids", label: _t("PoS categories"), widget: "chips", visible: (v) => v.kind !== "bill" },
        { name: "product_ids", label: _t("Products"), visible: (v) => v.kind !== "bill" },
        { section: _t("When and where"), icon: "fa-calendar" },
        ["date_from", "date_to"],
        { name: "config_ids", label: _t("Shops"), widget: "chips" },
        "active",
    ],
    validate: (v) => (v.date_from && v.date_to && v.date_to < v.date_from ? _t("The offer ends before it starts.") : null),
});
