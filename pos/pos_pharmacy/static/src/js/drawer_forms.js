import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "@modern_theme/js/app_kit/smart_drawer";

// More ▸ Medicines (action context modern_drawer: "medicine")
drawerForms.add("product.template:medicine", {
    title: _t("Medicine"),
    newTitle: _t("New medicine"),
    subtitle: _t("Found at the counter by brand or generic name. Batches and expiry come with each purchase."),
    fields: [
        { name: "name", label: _t("Brand name"), placeholder: _t("e.g. Napa 500") },
        { name: "ph_generic_name", placeholder: _t("e.g. Paracetamol") },
        ["ph_strength", "ph_manufacturer"],
        "ph_dosage_form",
        ["list_price", "barcode"],
        { section: _t("Selling by strip and box"), icon: "fa-th" },
        ["ph_strip_size", "ph_box_size"],
        { section: _t("At the counter"), icon: "fa-medkit" },
        "ph_rx_required",
        "ph_rack",
        { name: "pos_categ_ids", label: _t("PoS categories"), widget: "chips" },
    ],
    defaults: { ph_is_medicine: true },
    prepare: (vals, values, form) => {
        if (!form.recordId) {
            vals.ph_is_medicine = true;
            vals.available_in_pos = true;
        }
    },
});
