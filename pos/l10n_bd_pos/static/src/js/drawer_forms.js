import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "@modern_theme/js/app_kit/smart_drawer";

// Configuration ▸ Bangladesh VAT ▸ VAT registration (BIN): the company's BIN as a page
drawerForms.add("res.company:vat", {
    title: _t("VAT registration"),
    pageTitle: _t("VAT registration (BIN)"),
    subtitle: _t("Printed on every Mushak-6.3 and on the receipts."),
    fullForm: false,
    fields: [
        { name: "l10n_bd_bin", placeholder: "0000000000101" },
        { name: "vat", label: _t("TIN / VAT") },
        "l10n_bd_vat_area",
    ],
});
