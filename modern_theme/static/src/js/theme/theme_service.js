import { reactive } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { cookie } from "@web/core/browser/cookie";
import { registry } from "@web/core/registry";
import { session } from "@web/session";

/**
 * Modern Theme service (`mt_theme`).
 *
 * The server already renders every option as a `data-mt-*` attribute on <html>
 * (no flash on load). This service keeps those attributes in sync when the user
 * changes something, previews settings live, switches light/dark WITHOUT a page
 * reload (it swaps the CSS bundle), and follows the OS in "auto" mode.
 */

// Same list as models/theme_options.py (OPTIONS keys rendered as attributes).
export const ATTRIBUTE_OPTIONS = [
    "color_mode", "preset", "font", "font_scale", "radius", "border", "shadow", "density",
    "sidebar_style", "sidebar_bg", "sidebar_width", "topbar_style", "topbar_height",
    "content_width", "content_frame", "list_style", "form_style",
];

export const PRESET_SWATCHES = {
    once: "#171717", indigo: "#4f39f6", blue: "#155dfc", sky: "#0084cc", teal: "#009588", emerald: "#009767",
    green: "#00a544", amber: "#dd7400", yellow: "#cd8900", orange: "#f05100", red: "#e40014",
    rose: "#e70044", violet: "#7f22fe", slate: "#314158", zinc: "#27272a", stone: "#292524",
    gray: "#1e2939", neutral: "#171717",
};

const DARK_QUERY = "(prefers-color-scheme: dark)";
const SB_COOKIE = "mt_sb_collapsed";

/** WCAG relative luminance → best text colour on `hex` (same rule as the server). */
export function contrastForeground(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    if (!m) {
        return "#ffffff";
    }
    const lum = [m[1], m[2], m[3]]
        .map((h) => parseInt(h, 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
    return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.0558 ? "#ffffff" : "#0b0f17";
}

function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    return m ? [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(", ") : "";
}

/** Write the option attributes + custom colours on <html>. */
export function applyThemeAttributes(values, root = document.documentElement) {
    for (const key of ATTRIBUTE_OPTIONS) {
        if (values[key]) {
            root.setAttribute(`data-mt-${key.replaceAll("_", "-")}`, values[key]);
        }
    }
    root.setAttribute("data-mt-theme", values.preset || "once");
    root.setAttribute("data-mt-animations", values.animations === false ? "off" : "on");
    const style = root.style;
    if (values.preset === "custom" && values.primary_color) {
        style.setProperty("--mt-custom-primary", values.primary_color);
        style.setProperty("--mt-custom-primary-fg", contrastForeground(values.primary_color));
        style.setProperty("--mt-custom-primary-rgb", hexToRgb(values.primary_color));
    } else {
        style.removeProperty("--mt-custom-primary");
        style.removeProperty("--mt-custom-primary-fg");
        style.removeProperty("--mt-custom-primary-rgb");
    }
    if (values.accent_color) {
        style.setProperty("--mt-custom-accent", values.accent_color);
        style.setProperty("--mt-custom-accent-fg", contrastForeground(values.accent_color));
        root.setAttribute("data-mt-accent", "custom");
    } else {
        style.removeProperty("--mt-custom-accent");
        style.removeProperty("--mt-custom-accent-fg");
        root.removeAttribute("data-mt-accent");
    }
}

export const mtThemeService = {
    dependencies: ["orm"],
    start(env, { orm }) {
        const info = session.modern_theme;
        const root = document.documentElement;
        const state = reactive({
            enabled: Boolean(info),
            values: { ...(info?.values || {}) },
            user: { ...(info?.user || {}) },
            company: { ...(info?.company || {}) },
            favorites: [...(info?.favorites || [])],
            canAdmin: Boolean(info?.can_admin),
            scheme: info?.scheme || "light",
            previewing: false,
        });
        const cssLinks = info?.css_links || {};
        let saved = { ...state.values };

        // ------------------------------------------------------------------
        // Light / dark
        // ------------------------------------------------------------------
        function wantedScheme(values = state.values) {
            if (values.color_mode === "dark") {
                return "dark";
            }
            if (values.color_mode === "auto") {
                return browser.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
            }
            return "light";
        }

        function bundleLinks() {
            return [...document.querySelectorAll('link[rel="stylesheet"]')].filter((link) =>
                /\/web\.assets_web(_dark)?(\.min)?\.css/.test(link.getAttribute("href") || "")
            );
        }

        function swapStylesheet(scheme) {
            const current = bundleLinks().filter((l) => (l.media || "screen") !== "print");
            if (!current.length) {
                return Promise.resolve();
            }
            const old = current[current.length - 1];
            const href = old.getAttribute("href");
            let target = cssLinks[scheme];
            if (!target) {
                // Fallback: same folder, other bundle name; "any" lets the server pick the version.
                target = href
                    .replace(/\/web\/assets\/[^/]+\//, "/web/assets/any/")
                    .replace(/web\.assets_web(_dark)?/, scheme === "dark" ? "web.assets_web_dark" : "web.assets_web");
            }
            if (href === target) {
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.media = old.media || "screen";
                link.href = target;
                // Remove the old sheet only once the new one is ready: no flash of unstyled content.
                link.onload = () => {
                    old.remove();
                    resolve();
                };
                link.onerror = () => {
                    link.remove();
                    resolve();
                };
                old.after(link);
            });
        }

        async function syncScheme(values = state.values) {
            const scheme = wantedScheme(values);
            // The server reads this cookie in "auto" mode (ir_http.color_scheme).
            cookie.set("color_scheme", scheme);
            root.setAttribute("data-mt-scheme", scheme);
            if (scheme !== state.scheme) {
                root.classList.add("mt-scheme-switching");
                await swapStylesheet(scheme);
                state.scheme = scheme;
                browser.setTimeout(() => root.classList.remove("mt-scheme-switching"), 250);
                env.bus.trigger("MT_THEME:SCHEME-CHANGED", { scheme });
            }
        }

        // ------------------------------------------------------------------
        // Apply / preview
        // ------------------------------------------------------------------
        function apply(values) {
            applyThemeAttributes(values, root);
            syncScheme(values);
            env.bus.trigger("MT_THEME:CHANGED", { values });
        }

        /** Show values without saving (settings live preview). */
        function preview(partial) {
            state.previewing = true;
            apply({ ...state.values, ...partial });
        }

        function cancelPreview() {
            if (state.previewing) {
                state.previewing = false;
                apply(saved);
            }
        }

        function load(result) {
            Object.assign(state.values, result.values);
            state.user = { ...result.user };
            state.company = { ...result.company };
            state.favorites = [...(result.favorites || [])];
            state.previewing = false;
            saved = { ...state.values };
            apply(state.values);
        }

        if (state.enabled) {
            syncScheme();
            browser.matchMedia?.(DARK_QUERY).addEventListener?.("change", () => {
                if (state.values.color_mode === "auto") {
                    syncScheme();
                }
            });
        }

        return {
            state,
            apply,
            preview,
            cancelPreview,
            wantedScheme,
            /** Save personal overrides (False → follow the company). */
            async setUser(vals) {
                // Optimistic: the UI changes at once, the server confirms.
                apply({ ...state.values, ...Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== false && v !== "")) });
                load(await orm.call("res.users", "mt_set_appearance", [vals]));
            },
            async resetUser() {
                load(await orm.call("res.users", "mt_reset_appearance", []));
            },
            async setCompany(vals) {
                load(await orm.call("res.users", "mt_set_company_appearance", [vals]));
            },
            async reload() {
                load(await orm.call("res.users", "mt_get_theme", []));
            },
            /** Sidebar collapse is remembered per browser (cookie → rendered server-side). */
            setCollapsed(collapsed) {
                root.setAttribute("data-mt-sidebar-collapsed", collapsed ? "1" : "0");
                cookie.set(SB_COOKIE, collapsed ? "1" : "0");
            },
            isCollapsed() {
                return root.getAttribute("data-mt-sidebar-collapsed") === "1";
            },
            isFavorite(menuId) {
                return state.favorites.includes(menuId);
            },
            async toggleFavorite(menuId) {
                const list = state.favorites.includes(menuId)
                    ? state.favorites.filter((id) => id !== menuId)
                    : [...state.favorites, menuId];
                state.favorites = list;
                state.favorites = await orm.call("res.users", "mt_set_favorites", [list]);
            },
        };
    },
};

registry.category("services").add("mt_theme", mtThemeService);
