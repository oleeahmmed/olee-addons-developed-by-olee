import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "@modern_theme/js/app_kit/smart_drawer";

// More ▸ Styles (action context modern_drawer: "style")
drawerForms.add("product.template:style", {
    title: _t("Style"),
    subtitle: _t("Printed on the hand tag. Sizes and colours are the product's variants (full form)."),
    fields: [
        "name",
        ["cl_fabric", "cl_season"],
        { name: "cl_care", rows: 3 },
        ["list_price", "default_code"],
    ],
});
