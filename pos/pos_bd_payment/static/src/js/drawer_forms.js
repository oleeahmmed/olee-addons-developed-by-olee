import { _t } from "@web/core/l10n/translation";
import { drawerForms, extendDrawerForm } from "@modern_theme/js/app_kit/smart_drawer";
import "@pos_modern/js/drawer_forms";

// bKash / Nagad / Rocket… on the payment method drawer of pos_modern
extendDrawerForm(
    "pos.payment.method",
    [
        { name: "bd_provider", widget: "cards" },
        { name: "bd_merchant_number", visible: (v) => Boolean(v.bd_provider) },
        { name: "bd_needs_trx", visible: (v) => Boolean(v.bd_provider) },
        { name: "bd_needs_phone", visible: (v) => Boolean(v.bd_provider) },
    ],
    { after: "config_ids" }
);

// Configuration ▸ SMS gateway: the company's gateway as a page
drawerForms.add("res.company:sms", {
    title: _t("SMS gateway"),
    pageTitle: _t("SMS gateway"),
    fullForm: false,
    fields: [
        { name: "bd_sms_provider", widget: "cards" },
        { name: "bd_sms_api_key", password: true, visible: (v) => v.bd_sms_provider && v.bd_sms_provider !== "none" },
        { name: "bd_sms_sender", visible: (v) => v.bd_sms_provider && v.bd_sms_provider !== "none" },
        { name: "bd_sms_url", visible: (v) => v.bd_sms_provider === "custom" },
        { name: "bd_sms_auto", visible: (v) => v.bd_sms_provider && v.bd_sms_provider !== "none" },
        { name: "bd_sms_template", rows: 4, visible: (v) => v.bd_sms_provider && v.bd_sms_provider !== "none" },
    ],
});
