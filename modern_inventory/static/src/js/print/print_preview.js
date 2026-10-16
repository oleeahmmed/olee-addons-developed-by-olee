/** @odoo-module */
// Print preview for quotations, sales orders and invoices (shared by CRM Modern and Sales Modern).
//
// Odoo prints a PDF by downloading it through an XHR. Download managers (IDM...) grab that
// response and the browser gets an empty "204" instead: Odoo then shows
// "Arbitrary Uncaught Python Exception 204". Here the document is shown as Odoo's own HTML
// rendering of the very same report (same template, same layout, same rights) on an A4 sheet,
// printed with the browser, and "Download PDF" opens Odoo's PDF route in a new tab.
import { Component, onWillUnmount, useRef, useState, useSubEnv } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { useSetupAction } from "@web/search/action_hook";
import { Layout } from "@web/search/layout";
import { getDefaultConfig } from "@web/views/view";
import { getReportUrl } from "@web/webclient/actions/reports/utils";

const PRINT_MODELS = ["sale.order", "account.move", "stock.picking"];

function reportContext(report) {
    return { ...user.context, ...(report.context || {}) };
}

function withContext(url, context) {
    if (url.includes("context=")) {
        return url;
    }
    return `${url}${url.includes("?") ? "&" : "?"}context=${encodeURIComponent(JSON.stringify(context))}`;
}

export class ModernPrintPreview extends Component {
    static template = "modern_inventory.PrintPreview";
    static components = { Layout };
    static props = ["*"];

    setup() {
        useSubEnv({ config: { ...getDefaultConfig(), ...this.env.config } });
        useSetupAction();
        this.frame = useRef("frame");
        this.state = useState({ loading: true, height: 1123, title: "" });
        this.report = this.props.action?.params?.report || null;
        if (this.report) {
            const context = reportContext(this.report);
            this.htmlUrl = getReportUrl(this.report, "html", context);
            this.pdfUrl = withContext(getReportUrl(this.report, "pdf", context), context);
            this.count = (this.report.context?.active_ids || []).length;
        }
        this.timers = [];
        onWillUnmount(() => this.timers.forEach(clearTimeout));
    }

    get documentTitle() {
        return this.state.title || this.report?.display_name || this.report?.name || _t("Document");
    }

    onLoad() {
        const win = this.frame.el?.contentWindow;
        const doc = win?.document;
        if (!doc?.body) {
            return;
        }
        doc.body.classList.add("o_in_iframe", "container-fluid", "o_mp_doc");
        doc.body.classList.remove("container");
        const style = doc.createElement("style");
        style.textContent = `
            html, body { background: #ffffff !important; }
            body.o_mp_doc { margin: 0 !important; padding: 13mm 13mm 10mm !important; min-height: 297mm; box-sizing: border-box; }
            body.o_mp_doc > .container, body.o_mp_doc main > .container { max-width: none !important; padding: 0 !important; }
            body.o_mp_doc .page, body.o_mp_doc .article { page-break-inside: auto; }
            body.o_mp_doc .o_report_layout_modern + .o_report_layout_modern { break-before: page; }
            @media print {
                @page { size: A4; margin: 11mm 11mm 12mm; }
                body.o_mp_doc { padding: 0 !important; min-height: 0; }
                .o_ml_header, .o_ml_footer { break-inside: avoid; }
                thead { display: table-header-group; }
                tr { break-inside: avoid; }
            }
        `;
        doc.head.appendChild(style);
        // "Quotation # S00023": the title the layout prints, also the browser's PDF file name
        const titles = [...doc.querySelectorAll(".o_ml_title, .article h2, .page h2")]
            .map((el) => el.textContent.replace(/\s+/g, " ").trim())
            .filter(Boolean);
        this.state.title = titles.length > 1 ? `${titles[0]} +${titles.length - 1}` : titles[0] || "";
        if (titles[0]) {
            doc.title = titles.length > 1 ? `${titles[0]} (+${titles.length - 1})` : titles[0];
        }
        const fit = () => {
            if (this.frame.el && doc.documentElement) {
                this.state.height = Math.max(1123, doc.documentElement.scrollHeight);
            }
        };
        fit();
        this.timers.push(setTimeout(fit, 250), setTimeout(fit, 1200));
        doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", fit));
        this.state.loading = false;
    }

    print() {
        const win = this.frame.el?.contentWindow;
        if (win) {
            win.focus();
            win.print();
        }
    }

    download() {
        window.open(this.pdfUrl, "_blank", "noopener");
    }
}

registry.category("actions").add("modern_print_preview", ModernPrintPreview, { force: true });

// Every PDF report of a quotation / sales order / invoice opens the preview instead of a download.
registry.category("ir.actions.report handlers").add(
    "modern_print_preview",
    async (action, options, env) => {
        if (action.report_type !== "qweb-pdf") {
            return false;
        }
        const context = action.context || {};
        const model = action.model || context.active_model;
        const hasIds = (context.active_ids || []).length > 0;
        const hasData = action.data && Object.keys(action.data).length > 0;
        if (!PRINT_MODELS.includes(model) || (!hasIds && !hasData)) {
            return false;
        }
        await env.services.action.doAction({
            type: "ir.actions.client",
            tag: "modern_print_preview",
            name: _t("Print preview"),
            params: { report: action },
        });
        return true;
    },
    { force: true }
);
