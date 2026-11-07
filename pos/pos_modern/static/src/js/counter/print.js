import { formatCurrency } from "@web/core/currency";
import { registry } from "@web/core/registry";
import { renderToString } from "@web/core/utils/render";

/**
 * Thermal receipt printing from the browser (58 / 80 mm or A4).
 *
 * The receipt is rendered from an OWL template (pos_modern.Receipt, which shop addons
 * extend with t-inherit) into #ps-print-root, and the page is printed. Modern Theme's
 * POS stylesheet (modern_theme/static/src/scss/apps/pos.scss) hides everything else
 * while printing and sizes the page to the paper (CSS named pages ps-receipt-58/80).
 *
 * Set the receipt printer as the browser's default printer (or use Chrome's
 * --kiosk-printing) to print with no dialog.
 */
/**
 * Text filters applied to every number printed on a receipt: (text, receipt) => text.
 * l10n_bd_pos adds one that writes Bangla digits.
 */
export const receiptFormatters = registry.category("pos_modern.receipt_formatters");

function formatText(text, receipt) {
    let out = String(text);
    for (const fn of receiptFormatters.getAll()) {
        out = fn(out, receipt || {});
    }
    return out;
}

export function receiptMoney(currencyId, receipt = null) {
    return (value, symbol = false) =>
        formatText(formatCurrency(value || 0, currencyId, symbol ? {} : { noSymbol: true }), receipt);
}

export function receiptNum(receipt = null) {
    return (value) => formatText(Math.round((Number(value) || 0) * 1000) / 1000, receipt);
}

export function printTemplate(template, context, width = "80") {
    const html = renderToString(template, context);
    printHtml(html, width);
}

export function printHtml(html, width = "80") {
    let root = document.getElementById("ps-print-root");
    if (!root) {
        root = document.createElement("div");
        root.id = "ps-print-root";
        document.body.appendChild(root);
    }
    root.className = `ps-print-root ps-print-${width || "80"}`;
    root.innerHTML = html;
    document.body.classList.add("ps-printing");
    let cleaned = false;
    const done = () => {
        if (cleaned) {
            return;
        }
        cleaned = true;
        document.body.classList.remove("ps-printing");
        root.innerHTML = "";
        window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    // give the browser one frame to lay the receipt out (images: logo)
    setTimeout(() => {
        try {
            window.print();
        } finally {
            setTimeout(done, 500);
        }
    }, 60);
}

export function printReceipt(data, extra = {}) {
    printTemplate(
        "pos_modern.Receipt",
        { r: data, money: receiptMoney(data.currency_id, data), num: receiptNum(data), ...extra },
        data.width
    );
}

export function printSessionReport(report) {
    printTemplate(
        "pos_modern.SessionReport",
        { r: report, money: receiptMoney(report.currency_id, report), num: receiptNum(report) },
        report.width
    );
}
