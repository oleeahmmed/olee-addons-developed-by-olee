/** @odoo-module */
// Form header actions (shared by CRM Modern and Sales Modern), inside their apps only:
//   * always in view: Confirm / Post (Odoo shows them only while it is a quotation / draft),
//     Print, Preview and Cancel;
//   * every other button Odoo puts in the header goes to a "More" menu, in Odoo's order;
//   * quotations, orders and invoices always get a Print button (Odoo hides it on confirmed
//     orders and draft invoices).
// Odoo still decides which buttons exist, when they are visible and who may use them: the
// buttons are Odoo's own, only grouped differently.
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { FormCompiler } from "@web/views/form/form_compiler";
import { StatusBarButtons } from "@web/views/form/status_bar_buttons/status_bar_buttons";

const MAIN_BUTTONS = new Set([
    "action_confirm",
    "action_post",
    "sale.action_report_saleorder",
    "action_print_pdf",
    "action_preview_sale_order",
    "preview_invoice",
    "action_cancel",
    "button_cancel",
]);
const PRINT_BUTTONS = new Set(["sale.action_report_saleorder", "action_print_pdf"]);
const PRINT_MODELS_BY_NAME = {
    "sale.order": "sale.action_report_saleorder",
    "account.move": "account.account_invoices",
};
const APP_SELECTOR = ".o_cm_sidebar, .o_ss_sidebar";

function buttonName(key) {
    return (key || "").split("|")[1] || "";
}

if (!StatusBarButtons.__modernHeader) {
    StatusBarButtons.__modernHeader = true;

    // tell every header slot which button it holds (Odoo only numbers them)
    patch(FormCompiler.prototype, {
        compileHeader(el, params) {
            const statusBar = super.compileHeader(el, params);
            const buttons = [...statusBar.children].find((c) => c.tagName === "StatusBarButtons");
            for (const slot of buttons ? [...buttons.children] : []) {
                const button = slot.tagName === "ViewButton" ? slot : slot.getElementsByTagName("ViewButton")[0];
                let key = "";
                if (button) {
                    try {
                        const click = JSON.parse(button.getAttribute("clickParams") || "{}");
                        const attrs = JSON.parse(button.getAttribute("attrs") || "{}");
                        key = `${attrs.id || ""}|${click.name || ""}`;
                    } catch {
                        key = "";
                    }
                }
                slot.setAttribute("buttonKey", JSON.stringify(key));
            }
            return statusBar;
        },
    });

    StatusBarButtons.template = "sales_modern.StatusBarButtons";
    patch(StatusBarButtons.prototype, {
        setup() {
            super.setup(...arguments);
            this.actionService = useService("action");
        },
        get modernHeader() {
            return !this.env.isSmall && !!document.querySelector(APP_SELECTOR);
        },
        get modernGroups() {
            const main = [];
            const more = [];
            for (const name of this.visibleSlotNames) {
                const key = this.props.slots[name].buttonKey;
                (MAIN_BUTTONS.has(buttonName(key)) ? main : more).push(name);
            }
            return { main, more };
        },
        get modernRecord() {
            const record = this.env.model?.root;
            return record && PRINT_MODELS_BY_NAME[record.resModel] ? record : null;
        },
        get showModernPrint() {
            const record = this.modernRecord;
            if (!record || record.isNew) {
                return false;
            }
            if (record.resModel === "account.move" && !String(record.data.move_type || "").match(/invoice|refund|receipt/)) {
                return false;
            }
            return !this.modernGroups.main.some((name) => PRINT_BUTTONS.has(buttonName(this.props.slots[name].buttonKey)));
        },
        async modernPrint() {
            const record = this.modernRecord;
            if (!record || !(await record.save())) {
                return;
            }
            await this.actionService.doAction(PRINT_MODELS_BY_NAME[record.resModel], {
                additionalContext: { active_model: record.resModel, active_id: record.resId, active_ids: [record.resId] },
            });
        },
        get modernMoreLabel() {
            return _t("More");
        },
    });
}
