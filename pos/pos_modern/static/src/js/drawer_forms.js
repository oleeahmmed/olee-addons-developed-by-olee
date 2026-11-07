import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "@modern_theme/js/app_kit/smart_drawer";
import { CategoryDrawer } from "./drawer";

/**
 * Point of Sale ▸ Configuration in the smart drawer of modern_theme (same drawer as
 * Modern CRM): every list of these models opens and creates its records there.
 * Records with lines (pricelists, taxes, combos…) keep Odoo's full form; shop settings
 * (pos.config) too, they are a whole page.
 */
const forms = {
    "pos.category": { component: CategoryDrawer },
    // only what a cashier's payment method needs; accounts stay in the full form
    "pos.payment.method": {
        title: _t("Payment method"),
        newTitle: _t("New payment method"),
        fields: [
            { name: "name", placeholder: _t("e.g. Cash") },
            { name: "journal_id", label: _t("Journal"), domain: [["type", "in", ["cash", "bank"]]] },
            { name: "config_ids", label: _t("Shops"), widget: "chips" },
        ],
    },
    // a new shop from "+ New Shop" (settings) or a list: name and restaurant switch.
    // Opening a shop keeps Odoo's settings page (open: false).
    "pos.config": {
        title: _t("Shop"),
        newTitle: _t("New shop"),
        open: false,
        fields: [{ name: "name", label: _t("Shop name"), placeholder: _t("e.g. Gulshan branch"), required: true }, "module_pos_restaurant"],
    },
    "pos.preset": {
        title: _t("Preset"),
        newTitle: _t("New preset"),
        subtitle: _t("Dine in, takeaway, delivery… each with its own pricelist and taxes."),
        fields: [
            { name: "name", placeholder: _t("e.g. Takeaway") },
            "identification",
            "service_at",
            ["pricelist_id", "fiscal_position_id"],
            ["is_return", "use_guest"],
            { name: "color", widget: "color" },
        ],
    },
    "pos.bill": {
        title: _t("Coin / note"),
        newTitle: _t("New coin / note"),
        subtitle: _t("Quick cash buttons and the cash count at closing: ৳1000, ৳500, ৳100…"),
        fields: [["name", "value"], { name: "pos_config_ids", label: _t("Shops"), widget: "chips", hint: _t("None picked = every shop.") }],
    },
    "restaurant.floor": {
        title: _t("Floor"),
        newTitle: _t("New floor"),
        subtitle: _t("A room of the restaurant. Draw its tables from the register's floor plan."),
        fields: [
            { name: "name", placeholder: _t("e.g. Ground floor") },
            { name: "pos_config_ids", label: _t("Shops"), widget: "chips" },
            { name: "background_color", widget: "hexcolor" },
            "active",
        ],
    },
    "pos.note": {
        title: _t("Note model"),
        newTitle: _t("New note model"),
        subtitle: _t("Ready-made notes the cashier adds in one tap: less spicy, no onion…"),
        fields: [{ name: "name", placeholder: _t("e.g. Less spicy") }, { name: "color", widget: "color" }],
    },
    "pos.modern.modifier": {
        title: _t("Modifier"),
        newTitle: _t("New modifier"),
        subtitle: _t("Asked at the counter for the products or categories you pick."),
        fields: [
            [
                { name: "group_name", placeholder: _t("e.g. Spice") },
                { name: "name", label: _t("Choice"), placeholder: _t("e.g. Less spicy") },
            ],
            "price_extra",
            "single",
            { name: "pos_categ_ids", label: _t("PoS categories"), widget: "chips" },
            { name: "product_tmpl_ids", label: _t("Products"), domain: [["available_in_pos", "=", true]] },
            "active",
        ],
        validate: (v) =>
            v.pos_categ_ids.length || v.product_tmpl_ids.length
                ? null
                : _t("Pick at least one PoS category or product: that is where the counter asks for it."),
    },
};

for (const [key, spec] of Object.entries(forms)) {
    drawerForms.add(key, spec, { force: true });
}
