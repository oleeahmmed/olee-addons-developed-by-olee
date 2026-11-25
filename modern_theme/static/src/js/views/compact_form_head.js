/** @odoo-module **/
// Compact document header (quotations / sales orders, RFQs / purchase orders,
// invoices / bills, inventory transfers).
//
// Odoo renders the form <header> (Send, Print, Confirm… and the status steps
// Quotation › Sent › Sales Order) as its own row inside the sheet, under a tall
// breadcrumb block with the document number as page title. Here:
//   * the <header> is compiled out of the sheet and rendered in the control panel's
//     actions slot (where Odoo already puts the smart buttons), so breadcrumb,
//     actions, steps and pager share one row;
//   * the breadcrumb shows one small line, and the document number appears in the
//     sheet as a read-only, input-style "Number" field (modern_theme/scss/compact_form_head.scss).
// Buttons, visibility rules, access rights and clicks are Odoo's own: the header is
// compiled by the same FormCompiler and rendered with the same record.
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { FormCompiler } from "@web/views/form/form_compiler";
import { useViewCompiler } from "@web/views/view_compiler";
import { StatusBarButtons } from "@web/views/form/status_bar_buttons/status_bar_buttons";

/**
 * Documents: forms whose title is just their sequence number (S00010, INV/…, WH/OUT/…).
 * The number already shows in the breadcrumb, so the sheet hides it and lays the key
 * fields out as a column grid (.mt-doc). Every other main form (customers, products,
 * leads, employees…) gets the same page design but keeps its editable title.
 */
export const COMPACT_HEAD_MODELS = {
    "sale.order": _t("Number"),
    "purchase.order": _t("Number"),
    "account.move": _t("Number"),
    "account.payment": _t("Number"),
    "stock.picking": _t("Reference"),
    "mrp.production": _t("Reference"),
    "pos.order": _t("Reference"),
};
/** Forms that keep Odoo's own layout (two-pane settings). */
const EXCLUDED_MODELS = new Set(["res.config.settings"]);

FormController.components = { ...FormController.components, StatusBarButtons };

patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);
        this.mtHeaderTemplate = null;
        this.mtCompact = false;
        this.mtDoc = false;
        const embedded = (this.props.className || "").includes("_native_view");
        if (this.env.inDialog || this.env.isSmall || embedded || EXCLUDED_MODELS.has(this.props.resModel)) {
            return;
        }
        // every main form gets the page design (cards, tabs, sections, header row)
        this.mtCompact = true;
        const label = COMPACT_HEAD_MODELS[this.props.resModel];
        this.mtDoc = Boolean(label);
        this.mtNumberLabel = label ? JSON.stringify(String(label)) : "";
        const header = this.archInfo.xmlDoc.querySelector(":scope > header");
        if (!header) {
            return;
        }
        // the renderer compiles a copy of the arch without the header
        const xmlDoc = this.archInfo.xmlDoc.cloneNode(true);
        xmlDoc.querySelector(":scope > header").remove();
        this.archInfo = { ...this.archInfo, xmlDoc, arch: xmlDoc.outerHTML };
        const templates = useViewCompiler(this.props.Compiler || FormCompiler, { MtHeader: header }, { isSubView: true });
        this.mtHeaderTemplate = templates.MtHeader;
    },

    /** Rendering context of the header template (same as the smart buttons'). */
    get mtHeaderContext() {
        return Object.assign(Object.create(this), {
            this: this,
            state: { isStatusbarStickyPinned: false },
            props: { ...this.props, record: this.model.root },
        });
    },

    get className() {
        const className = super.className;
        if (!this.mtCompact) {
            return className;
        }
        const extra = this.mtDoc ? "mt-compact-head mt-doc" : "mt-compact-head";
        return typeof className === "string"
            ? `${className} ${extra}`
            : { ...className, [extra]: true };
    },
});
