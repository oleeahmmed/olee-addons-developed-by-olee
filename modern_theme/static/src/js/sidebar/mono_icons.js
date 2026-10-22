import { registry } from "@web/core/registry";

/**
 * Some app icons are a single-colour glyph on a transparent background (Odoo 19's
 * Discuss, Apps and Settings icons are white line drawings). White on a light sidebar,
 * or black on a dark one, they disappear. Each app icon image is looked at once when it
 * loads; a one-colour glyph gets the "is-mono" tile (brand colour, white glyph) so it
 * reads the same in light and dark mode. Coloured icons are left untouched.
 */
const cache = new Map(); // src -> "light" | "dark" | ""

function classify(img) {
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    try {
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let visible = 0;
        let lum = 0;
        let sat = 0;
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 40) {
                continue;
            }
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            visible++;
            lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
            sat += max - min;
        }
        const total = size * size;
        // A real tile icon covers most of the square; a glyph leaves it mostly transparent.
        if (!visible || visible / total > 0.7) {
            return "";
        }
        lum /= visible;
        sat /= visible;
        if (sat > 0.18) {
            return ""; // coloured drawing: readable on both backgrounds
        }
        return lum > 0.75 ? "light" : lum < 0.3 ? "dark" : "";
    } catch {
        return ""; // cross-origin image: leave it as it is
    }
}

function mark(img) {
    const holder = img.closest(".mt-app-icon");
    if (!holder || !img.complete || !img.naturalWidth) {
        return;
    }
    const key = img.currentSrc || img.src;
    if (img.dataset.mtMono === key) {
        return; // already looked at
    }
    img.dataset.mtMono = key;
    if (!cache.has(key)) {
        cache.set(key, classify(img));
    }
    const kind = cache.get(key);
    holder.classList.toggle("is-mono", Boolean(kind));
    holder.classList.toggle("is-mono-dark", kind === "dark");
}

export const monoIconService = {
    start() {
        // "load" does not bubble: listen in the capture phase for every app icon image.
        document.addEventListener(
            "load",
            (ev) => {
                const img = ev.target;
                if (img instanceof HTMLImageElement && img.closest(".mt-app-icon")) {
                    mark(img);
                }
            },
            true
        );
        // Images already loaded (from the browser cache) before the listener existed
        let queued = false;
        const scan = () => {
            queued = false;
            document.querySelectorAll(".mt-app-icon img").forEach(mark);
        };
        new MutationObserver(() => {
            if (!queued) {
                queued = true;
                requestAnimationFrame(scan);
            }
        }).observe(document.body, { childList: true, subtree: true });
        scan();
    },
};

registry.category("services").add("mt_mono_icons", monoIconService);
