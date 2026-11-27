import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { browser } from "@web/core/browser/browser";
import { PosStore } from "@point_of_sale/app/services/pos_store";

/** One profile per business type: catalogue layout + tile density. */
export const PUX_PROFILES = {
    restaurant: { label: _t("Restaurant"), icon: "fa-cutlery", layout: "rail", density: "tiles" },
    cafe: { label: _t("Cafe"), icon: "fa-coffee", layout: "rail", density: "tiles" },
    fastfood: { label: _t("Fast Food"), icon: "fa-bolt", layout: "chips", density: "tiles" },
    bakery: { label: _t("Bakery"), icon: "fa-birthday-cake", layout: "chips", density: "tiles" },
    retail: { label: _t("Retail"), icon: "fa-shopping-bag", layout: "chips", density: "tiles" },
    grocery: { label: _t("Grocery"), icon: "fa-shopping-basket", layout: "chips", density: "dense" },
    fashion: { label: _t("Fashion"), icon: "fa-tags", layout: "chips", density: "tall" },
    pharmacy: { label: _t("Pharmacy"), icon: "fa-medkit", layout: "chips", density: "list" },
};

const LS = "pos_ui_pro.";
const readLS = (key, fallback) => {
    try {
        return browser.localStorage.getItem(LS + key) ?? fallback;
    } catch {
        return fallback;
    }
};
const writeLS = (key, value) => {
    try {
        browser.localStorage.setItem(LS + key, value);
    } catch {
        // private mode: keep the choice for this session only
    }
};

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        const cookieDark = /(?:^|;\s*)(pos_)?color_scheme=dark/.test(document.cookie);
        this.puxUi = {
            style: readLS(`style.${this.config.id}`, this.config.pux_pos_style || "cart"),
            dark: readLS("dark", cookieDark ? "1" : "0") === "1",
            catalog: readLS("catalog", "1") === "1", // Bill style: product panel open
        };
        this.puxApplyTheme();
    },
    get puxType() {
        const type = this.config?.pux_business_type;
        if (type && PUX_PROFILES[type]) {
            return type;
        }
        return this.config?.module_pos_restaurant ? "restaurant" : "retail";
    },
    get puxProfile() {
        return PUX_PROFILES[this.puxType];
    },
    get puxClass() {
        const p = this.puxProfile;
        const ui = this.puxUi || {};
        return [
            "pux",
            `pux-${this.puxType}`,
            `pux-l-${p.layout}`,
            `pux-d-${p.density}`,
            `pux-s-${ui.style || "cart"}`,
            ui.style === "bill" && !ui.catalog ? "pux-no-catalog" : "",
        ].join(" ");
    },
    /** Theme classes go on <html> so dialogs and popovers follow too. */
    puxApplyTheme() {
        const html = document.documentElement;
        for (const c of [...html.classList]) {
            if (c.startsWith("pux-c-")) {
                html.classList.remove(c);
            }
        }
        html.classList.add("pux-theme", `pux-c-${this.config.pux_theme_color || "neutral"}`);
        html.classList.toggle("pux-dark", Boolean(this.puxUi?.dark));
    },
    puxSetStyle(style) {
        this.puxUi.style = style;
        writeLS(`style.${this.config.id}`, style);
    },
    puxToggleDark() {
        this.puxUi.dark = !this.puxUi.dark;
        writeLS("dark", this.puxUi.dark ? "1" : "0");
        this.puxApplyTheme();
    },
    puxToggleCatalog() {
        this.puxUi.catalog = !this.puxUi.catalog;
        writeLS("catalog", this.puxUi.catalog ? "1" : "0");
    },
});
