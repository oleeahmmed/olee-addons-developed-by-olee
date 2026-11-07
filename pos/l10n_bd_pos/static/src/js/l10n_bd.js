import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { PosMenu } from "@pos_modern/js/menu";

const BN = "০১২৩৪৫৬৭৮৯";

/** Receipt numbers in Bangla digits when the shop asks for it. */
registry.category("pos_modern.receipt_formatters").add("l10n_bd_digits", (text, receipt) =>
    receipt?.extra?.bn_digits ? text.replace(/[0-9]/g, (d) => BN[Number(d)]) : text
);

patch(PosMenu.prototype, {
    /** Mushak-6.3 (A4 PDF) of the order just paid. */
    printMushak() {
        if (this.state.done?.id) {
            return this.action.doAction("l10n_bd_pos.action_report_mushak", {
                additionalContext: { active_ids: [this.state.done.id], active_id: this.state.done.id, active_model: "pos.order" },
                props: { resIds: [this.state.done.id] },
            });
        }
    },
});

const icons = registry.category("pos_modern.menu_icons");
icons.add("l10n_bd_pos.menu_vat_register", "fa-book");
icons.add("l10n_bd_pos.menu_bd_vat", "fa-university");
icons.add("l10n_bd_pos.menu_company_vat", "fa-id-card-o");
icons.add("l10n_bd_pos.menu_bd_taxes", "fa-percent");
icons.add("l10n_bd_pos.menu_products_bn", "fa-language");
icons.add("l10n_bd_pos.menu_partners_bin", "fa-building-o");
