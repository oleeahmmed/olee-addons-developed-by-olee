import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { PosMenu } from "@pos_modern/js/menu";

/**
 * Bangladesh payments on the counter: TrxID checked before saving (format, typed twice),
 * the merchant number shown on wallet tenders, and the SMS receipt.
 */
patch(PosMenu.prototype, {
    setup() {
        super.setup(...arguments);
        this.state.sms = { phone: "", busy: false, sent: "" };
    },
    checkTenders() {
        const error = super.checkTenders(...arguments);
        if (error) {
            return error;
        }
        const seen = new Set();
        for (const p of this.state.payments) {
            const m = this.method(p.method_id);
            if (!m?.provider || !(Number(p.amount) > 0)) {
                continue;
            }
            const ref = String(p.ref || "").replace(/\s+/g, "").toUpperCase();
            if (m.needs_ref && !ref) {
                return _t("Type the TrxID of the %s payment.", m.name);
            }
            if (ref && m.trx_pattern) {
                let re;
                try {
                    re = new RegExp(m.trx_pattern);
                } catch {
                    re = null;
                }
                if (re && !re.test(ref)) {
                    return _t("“%(ref)s” is not a valid %(method)s TrxID.", { ref, method: m.name });
                }
            }
            if (ref) {
                const key = `${m.provider}:${ref}`;
                if (seen.has(key)) {
                    return _t("The TrxID %s is typed twice.", ref);
                }
                seen.add(key);
            }
        }
        return "";
    },
    newOrder() {
        super.newOrder(...arguments);
        Object.assign(this.state.sms, { phone: "", busy: false, sent: "" });
    },
    orderPaid(result) {
        Object.assign(this.state.sms, { phone: "", busy: false, sent: "" });
        super.orderPaid(...arguments);
    },
    async sendSms() {
        const done = this.state.done;
        if (!done?.id || this.state.sms.busy) {
            return;
        }
        this.state.sms.busy = true;
        try {
            const phone = this.state.sms.phone || done.receipt?.customer?.phone || "";
            const res = await this.orm.call("pos.order", "pos_bd_send_sms", [[done.id], phone || false]);
            this.state.sms.sent = res.state;
            this.notification.add(
                res.state === "sent" ? _t("SMS sent to %s", res.to) : _t("SMS queued for %s", res.to),
                { type: res.state === "sent" ? "success" : "info" }
            );
        } finally {
            this.state.sms.busy = false;
        }
    },
});

const icons = registry.category("pos_modern.menu_icons");
icons.add("pos_bd_payment.menu_reconcile", "fa-check-square-o");
icons.add("pos_bd_payment.menu_bd_payment_methods", "fa-mobile");
icons.add("pos_bd_payment.menu_sms_settings", "fa-commenting-o");
icons.add("pos_bd_payment.menu_sms_log", "fa-envelope-o");
