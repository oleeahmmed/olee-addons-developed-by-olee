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

/** Models whose main form gets the compact header, with the label of their number field. */
export const COMPACT_HEAD_MODELS = {
    "sale.order": _t("Number"),
    "purchase.order": _t("Number"),
    "account.move": _t("Number"),
    "stock.picking": _t("Reference"),
    // products: one product page for every app (Sales, Purchase, Inventory, POS, MRP…)
    "product.template": _t("Product"),
    "product.product": _t("Product"),
};

FormController.components = { ...FormController.components, StatusBarButtons };

patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);
        this.mtHeaderTemplate = null;
        this.mtCompact = false;
        const label = COMPACT_HEAD_MODELS[this.props.resModel];
        if (!label || this.env.inDialog || this.env.isSmall) {
            return;
        }
        // the page design (cards, tabs, sections) applies even without a <header> to move
        this.mtCompact = true;
        this.mtNumberLabel = JSON.stringify(String(label));
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
        return typeof className === "string"
            ? `${className} mt-compact-head`
            : { ...className, "mt-compact-head": true };
    },
});
