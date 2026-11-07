import { _t } from "@web/core/l10n/translation";
import { drawerForms } from "./smart_drawer";

/**
 * Simple records of Odoo's own apps, opened in the smart drawer from every list
 * (Configuration menus, modern pages…). Only records without lines: anything with
 * lines (quotation templates, payment terms, routes, pricelists, taxes…) keeps
 * Odoo's full form. A model that is not installed is never asked for.
 * App addons add their own models the same way (see custom-addons/pos).
 */
const forms = {
    // ------------------------------------------------------------------ products
    "product.tag": {
        title: _t("Product tag"),
        newTitle: _t("New product tag"),
        subtitle: _t("Labels to sort, filter and find products."),
        fields: ["name", { name: "color", widget: "hexcolor" }, "visible_to_customers"],
    },
    "product.category": {
        title: _t("Product category"),
        newTitle: _t("New product category"),
        subtitle: _t("Groups of products. Inventory and accounting settings are inherited by its products."),
        fields: [
            { name: "name", placeholder: _t("e.g. Drinks") },
            { name: "parent_id", placeholder: _t("None (top level)") },
            { section: _t("Inventory"), icon: "fa-cubes" },
            ["property_cost_method", "property_valuation"],
            "removal_strategy_id",
            { section: _t("Accounting"), icon: "fa-book" },
            "property_account_income_categ_id",
            "property_account_expense_categ_id",
        ],
    },
    "product.attribute": {
        title: _t("Attribute"),
        newTitle: _t("New attribute"),
        subtitle: _t("Size, colour, material… and their values. Products pick the values they come in."),
        fields: [
            { name: "name", placeholder: _t("e.g. Size") },
            { name: "value_ids", label: _t("Values"), placeholder: _t("Type a value (S, M, L…) and press Enter"),
              hint: _t("In the order shown to customers and cashiers.") },
            "display_type",
            "create_variant",
        ],
    },
    "uom.uom": {
        title: _t("Unit"),
        newTitle: _t("New unit"),
        subtitle: _t("How products are counted: pieces, kg, litre, dozen, carton…"),
        fields: [
            { name: "name", placeholder: _t("e.g. Dozen") },
            ["relative_factor", "relative_uom_id"],
            "is_pos_groupable",
            "active",
        ],
    },
    "product.supplierinfo": {
        title: _t("Vendor price"),
        newTitle: _t("New vendor price"),
        subtitle: _t("What a vendor charges for a product, from which quantity."),
        fields: [
            "partner_id",
            "product_tmpl_id",
            ["product_name", "product_code"],
            ["min_qty", "price"],
            ["discount", "delay"],
            ["date_start", "date_end"],
        ],
    },
    // ------------------------------------------------------------------ contacts
    "res.partner.category": {
        title: _t("Contact tag"),
        newTitle: _t("New contact tag"),
        subtitle: _t("Labels to sort and find contacts: VIP, wholesale, supplier…"),
        fields: ["name", "parent_id", { name: "color", widget: "color" }, "active"],
    },
    "res.partner.industry": {
        title: _t("Industry"),
        newTitle: _t("New industry"),
        fields: ["name", "full_name", "active"],
    },
    "res.bank": {
        title: _t("Bank"),
        newTitle: _t("New bank"),
        subtitle: _t("A bank your company or your contacts have accounts with."),
        fields: [
            { name: "name", placeholder: _t("e.g. BRAC Bank") },
            "bic",
            ["phone", "email"],
            { section: _t("Address"), icon: "fa-map-marker" },
            "street",
            ["city", "zip"],
            "country",
        ],
    },
    "res.partner.bank": {
        title: _t("Bank account"),
        newTitle: _t("New bank account"),
        fields: ["acc_number", "partner_id", "bank_id", "acc_holder_name", "currency_id", "allow_out_payment"],
    },
    // ------------------------------------------------------------------ CRM & marketing
    "crm.tag": {
        title: _t("Tag"),
        newTitle: _t("New tag"),
        subtitle: _t("Labels to sort and filter leads and opportunities."),
        fields: [{ name: "name", placeholder: _t("e.g. Hot lead") }, { name: "color", widget: "color" }],
    },
    "crm.lost.reason": {
        title: _t("Lost reason"),
        newTitle: _t("New lost reason"),
        subtitle: _t("Why a deal was lost — salespeople pick one of these."),
        fields: ["name", "active"],
    },
    "crm.stage": {
        title: _t("Stage"),
        newTitle: _t("New stage"),
        subtitle: _t("A step deals move through on the pipeline."),
        fields: ["name", { name: "team_ids", widget: "chips", hint: _t("None picked = every team.") }, ["is_won", "fold"], "rotting_threshold_days", "requirements"],
    },
    "utm.source": { title: _t("Source"), newTitle: _t("New source"), fields: ["name"] },
    "utm.medium": { title: _t("Medium"), newTitle: _t("New medium"), fields: ["name", "active"] },
    "utm.tag": { title: _t("Tag"), newTitle: _t("New tag"), fields: ["name", { name: "color", widget: "color" }] },
    "mail.activity.type": {
        title: _t("Activity type"),
        newTitle: _t("New activity type"),
        subtitle: _t("Call, email, meeting… and when it is due."),
        fields: [
            { name: "name", placeholder: _t("e.g. Call") },
            "summary",
            "category",
            ["delay_count", "delay_unit"],
            "delay_from",
            "default_user_id",
            "icon",
            "decoration_type",
            "default_note",
        ],
    },
    // ------------------------------------------------------------------ accounting
    "account.account": {
        title: _t("Account"),
        newTitle: _t("New account"),
        subtitle: _t("An account of the chart of accounts."),
        fields: [["code", "name"], "account_type", "currency_id", { name: "tax_ids", label: _t("Default taxes") }, ["reconcile", "non_trade"], "description"],
    },
    "account.journal": {
        title: _t("Journal"),
        newTitle: _t("New journal"),
        subtitle: _t("Where entries are recorded: sales, purchases, a bank, cash… Payment methods and advanced options are in the full form."),
        fields: [
            { name: "name", placeholder: _t("e.g. City Bank") },
            "type",
            ["code", "currency_id"],
            "default_account_id",
            { name: "bank_account_id", visible: (v) => v.type === "bank" },
            { name: "suspense_account_id", visible: (v) => ["bank", "cash", "credit"].includes(v.type) },
            ["profit_account_id", "loss_account_id"],
            "show_on_dashboard",
        ],
    },
    "account.incoterms": { title: _t("Incoterm"), newTitle: _t("New incoterm"), fields: [["code", "name"], "active"] },
    "account.cash.rounding": {
        title: _t("Cash rounding"),
        newTitle: _t("New cash rounding"),
        subtitle: _t("Round cash totals to the smallest coin, e.g. to 1 Taka."),
        fields: ["name", ["rounding", "rounding_method"], "strategy", ["profit_account_id", "loss_account_id"]],
    },
    "account.analytic.account": {
        title: _t("Analytic account"),
        newTitle: _t("New analytic account"),
        fields: ["name", ["code", "plan_id"], "partner_id", "active"],
    },
    "account.tax.group": {
        title: _t("Tax group"),
        newTitle: _t("New tax group"),
        fields: ["name", "pos_receipt_label", "preceding_subtotal", "tax_payable_account_id", "tax_receivable_account_id", "country_id"],
    },
    // ------------------------------------------------------------------ inventory
    "stock.warehouse": {
        title: _t("Warehouse"),
        newTitle: _t("New warehouse"),
        subtitle: _t("A building or godown with its own stock. Routes and operation types are created for you."),
        fields: [
            { name: "name", placeholder: _t("e.g. Mirpur godown") },
            { name: "code", hint: _t("Short name, up to 5 letters: used in references (WH/IN/0001).") },
            "partner_id",
            { section: _t("Steps"), icon: "fa-random" },
            "reception_steps",
            "delivery_steps",
            "manufacture_steps",
        ],
    },
    "stock.location": {
        title: _t("Location"),
        newTitle: _t("New location"),
        subtitle: _t("A place where stock is kept: a shelf, a rack, a room."),
        fields: [
            { name: "name", placeholder: _t("e.g. Shelf A") },
            "location_id",
            "usage",
            "barcode",
            ["removal_strategy_id", "storage_category_id"],
            "replenish_location",
            "active",
        ],
    },
    "stock.picking.type": {
        title: _t("Operation type"),
        newTitle: _t("New operation type"),
        subtitle: _t("Receipts, deliveries, internal transfers… and their default locations."),
        fields: [
            "name",
            "code",
            ["sequence_code", "warehouse_id"],
            ["default_location_src_id", "default_location_dest_id"],
            "reservation_method",
            "create_backorder",
            ["use_create_lots", "use_existing_lots"],
            "active",
        ],
    },
    "stock.putaway.rule": {
        title: _t("Putaway rule"),
        newTitle: _t("New putaway rule"),
        subtitle: _t("Where received products go automatically."),
        fields: [["product_id", "category_id"], ["location_in_id", "location_out_id"], "storage_category_id", "sublocation"],
    },
    "stock.package.type": {
        title: _t("Package type"),
        newTitle: _t("New package type"),
        fields: ["name", "barcode", ["packaging_length", "width"], ["height", "base_weight"], "max_weight", "package_use"],
    },
    "stock.storage.category": {
        title: _t("Storage category"),
        newTitle: _t("New storage category"),
        fields: ["name", "max_weight", "allow_new_product"],
    },
    "stock.lot": {
        title: _t("Lot / serial number"),
        newTitle: _t("New lot / serial number"),
        subtitle: _t("Stock, moves and traceability are in the full form."),
        fields: ["name", "product_id", "ref", ["expiration_date", "alert_date"], "note"],
    },
    // ------------------------------------------------------------------ manufacturing
    "mrp.workcenter": {
        title: _t("Work centre"),
        newTitle: _t("New work centre"),
        subtitle: _t("A machine, a line or a team where production happens."),
        fields: [
            [{ name: "name", required: true }, "code"],
            { name: "tag_ids", label: _t("Tags"), create: true },
            ["time_efficiency", "oee_target"],
            ["time_start", "time_stop"],
            "costs_hour",
            "resource_calendar_id",
            { name: "alternative_workcenter_ids", label: _t("Alternative work centres") },
        ],
    },
    "mrp.workcenter.tag": { title: _t("Work centre tag"), newTitle: _t("New tag"), fields: ["name", { name: "color", widget: "color" }] },
    "mrp.workcenter.productivity.loss": {
        title: _t("Productivity loss"),
        newTitle: _t("New productivity loss"),
        fields: ["name", "loss_id", "manual"],
    },
    // ------------------------------------------------------------------ employees & time off
    "hr.department": {
        title: _t("Department"),
        newTitle: _t("New department"),
        fields: ["name", "parent_id", "manager_id", { name: "color", widget: "color" }, "note"],
    },
    "hr.job": {
        title: _t("Job position"),
        newTitle: _t("New job position"),
        fields: ["name", "department_id", "contract_type_id", "no_of_recruitment", "user_id", "requirements"],
    },
    "hr.work.location": {
        title: _t("Work location"),
        newTitle: _t("New work location"),
        fields: ["name", "location_type", "address_id", "location_number", "active"],
    },
    "hr.departure.reason": { title: _t("Departure reason"), newTitle: _t("New departure reason"), fields: ["name", "country_id"] },
    "hr.employee.category": { title: _t("Employee tag"), newTitle: _t("New employee tag"), fields: ["name", { name: "color", widget: "color" }] },
    "hr.contract.type": { title: _t("Contract type"), newTitle: _t("New contract type"), fields: ["name", "code", "country_id"] },
    "hr.leave.type": {
        title: _t("Time off type"),
        newTitle: _t("New time off type"),
        subtitle: _t("Casual, sick, annual leave… and how it is requested and approved."),
        fields: [
            { name: "name", placeholder: _t("e.g. Casual leave") },
            "requires_allocation",
            "employee_requests",
            "leave_validation_type",
            "allocation_validation_type",
            "request_unit",
            "time_type",
            "unpaid",
            "support_document",
            "include_public_holidays_in_duration",
            { name: "color", widget: "color" },
        ],
    },
    "hr.leave.mandatory.day": {
        title: _t("Mandatory day"),
        newTitle: _t("New mandatory day"),
        subtitle: _t("Days nobody can take off: stock taking, a fair…"),
        fields: ["name", ["start_date", "end_date"], { name: "department_ids", label: _t("Departments") }, { name: "color", widget: "color" }],
    },
    // ------------------------------------------------------------------ project
    "project.tags": { title: _t("Project tag"), newTitle: _t("New tag"), fields: ["name", { name: "color", widget: "color" }] },
    "project.task.type": {
        title: _t("Task stage"),
        newTitle: _t("New task stage"),
        fields: ["name", { name: "project_ids", label: _t("Projects") }, "fold", "rotting_threshold_days", "mail_template_id", "active"],
    },
    "project.project.stage": {
        title: _t("Project stage"),
        newTitle: _t("New project stage"),
        fields: ["name", "fold", "mail_template_id", "active"],
    },
};

for (const [key, spec] of Object.entries(forms)) {
    if (!drawerForms.contains(key)) {
        drawerForms.add(key, spec);
    }
}
