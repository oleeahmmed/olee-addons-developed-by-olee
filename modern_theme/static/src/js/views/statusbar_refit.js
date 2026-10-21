/** @odoo-module **/
// Odoo folds the status steps ("Quotation > Sent > Sales Order") into a single
// dropdown when they don't fit, but only re-checks on window resize. The form
// header settles after the first measure (chatter, fonts, buttons), so the steps
// often stayed folded on wide screens. Re-check whenever the header changes size.
import { onMounted, onWillUnmount } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { StatusBarField } from "@web/views/fields/statusbar/statusbar_field";

patch(StatusBarField.prototype, {
    setup() {
        super.setup(...arguments);
        let observer = null;
        let frame = 0;
        let lastWidth = -1;
        onMounted(() => {
            const root = this.rootRef.el;
            const host = root?.closest(".o_form_statusbar") || root?.parentElement;
            if (!host || typeof ResizeObserver === "undefined") {
                return;
            }
            observer = new ResizeObserver((entries) => {
                const width = Math.round(entries[0]?.contentRect.width || 0);
                if (width === lastWidth) {
                    return;
                }
                lastWidth = width;
                cancelAnimationFrame(frame);
                frame = requestAnimationFrame(() => {
                    if (this.rootRef.el) {
                        this.adjustVisibleItems();
                        this.render();
                    }
                });
            });
            observer.observe(host);
        });
        onWillUnmount(() => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
        });
    },
});
