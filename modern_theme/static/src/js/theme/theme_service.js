import { reactive } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { cookie } from "@web/core/browser/cookie";
import { registry } from "@web/core/registry";
import { session } from "@web/session";

/**
 * Modern Theme service (`mt_theme`).
 *
 * The server renders the single shadcn look as `data-mt-*` attributes on <html>
 * before the first paint. This service only switches light/dark without a page
 * reload (it swaps the CSS bundle), keeps the choice in a cookie the server
 * reads on the next load, and handles the sidebar's pinned menus.
 */

const SB_COOKIE = "mt_sb_collapsed";

export const mtThemeService = {
    dependencies: ["orm"],
    start(env, { orm }) {
        const info = session.modern_theme;
        const root = document.documentElement;
        const state = reactive({
            enabled: Boolean(info),
            scheme: info?.scheme || "light",
            favorites: [...(info?.favorites || [])],
        });
        const cssLinks = info?.css_links || {};

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

        async function setScheme(scheme) {
            scheme = scheme === "dark" ? "dark" : "light";
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

        return {
            state,
            setScheme,
            toggleScheme() {
                return setScheme(state.scheme === "dark" ? "light" : "dark");
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
