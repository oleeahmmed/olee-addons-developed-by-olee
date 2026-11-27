import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { PosMenu } from "@pos_modern/js/menu";

const STYLE_SEEN = "pos_ui_pro.menu.style_seen.";

/**
 * Counter (Menu page): reads the shop's Business type, Theme color and default
 * POS style (fields of pos_ui_pro on pos.config) and exposes them as data
 * attributes on the counter root; modern_theme's pos.scss styles them.
 */
patch(PosMenu.prototype, {
    setup() {
        super.setup(...arguments);
        this.pux = useState({ biz: "retail", color: "blue" });
    },
    async load(configId = this.configId) {
        const res = await super.load(...arguments);
        this.puxLoad(this.configId);
        return res;
    },
    async puxLoad(configId) {
        if (!configId) {
            return;
        }
        let row;
        try {
            [row] = await this.orm.read(
                "pos.config",
                [configId],
                ["pux_business_type", "pux_theme_color", "pux_pos_style"]
            );
        } catch {
            return; // fields not installed yet: keep the defaults
        }
        if (!row) {
            return;
        }
        this.pux.biz = row.pux_business_type || "retail";
        this.pux.color = row.pux_theme_color || "blue";
        // The shop's default style applies once per device; after that the cashier's choice wins.
        try {
            const key = STYLE_SEEN + configId + "." + row.pux_pos_style;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, "1");
                this.setLayout(row.pux_pos_style === "bill" ? "bill" : "cart");
            }
        } catch {
            // storage blocked: nothing to remember
        }
    },
});
