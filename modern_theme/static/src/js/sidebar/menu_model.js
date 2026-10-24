import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

/**
 * Menu model shared by the sidebar (3 styles) and the command palette.
 *
 * Everything comes from Odoo's own `menu` service (ir.ui.menu as loaded by
 * /web/webclient/load_menus), so groups, record rules and installed modules
 * are always respected. App addons can tune how their app is shown by adding
 * an entry to the `modern_theme.sidebar_apps` registry, keyed by the app's
 * root menu xmlid (see README.md "Sidebar API").
 */
export const sidebarApps = registry.category("modern_theme.sidebar_apps");
/** xmlid -> async (env) => number | null: small counter badge next to a menu. */
export const menuBadges = registry.category("modern_theme.menu_badges");
/** Models the command palette searches records in: { model, label, icon, domain? }. */
export const paletteModels = registry.category("modern_theme.palette_models");
/**
 * xmlid -> app root xmlid: an Odoo menu another app now shows (e.g. Invoicing's
 * Accounting / Review groups, shown by Modern Accounting). The menu is hidden from
 * every other app, but only while that app is visible to the user.
 */
export const movedMenus = registry.category("modern_theme.moved_menus");

const DEFAULT_APP_ICON = "/web/static/img/default_icon_app.png";

// Font Awesome 4.7 icon guessed from the menu name / xmlid when no addon gives one.
const ICON_RULES = [
    [/dashboard|overview|home/i, "fa-th-large"],
    [/report|analys|statistic|forecast/i, "fa-bar-chart"],
    [/config|setting|preference/i, "fa-cog"],
    [/pipeline|opportunit/i, "fa-columns"],
    [/lead/i, "fa-user-plus"],
    [/activit/i, "fa-clock-o"],
    [/campaign|marketing/i, "fa-bullhorn"],
    [/quotation|estimate/i, "fa-file-text-o"],
    [/invoice|bill|credit note/i, "fa-file-text"],
    [/payment|bank|cash/i, "fa-credit-card"],
    [/journal|account|ledger/i, "fa-book"],
    [/purchase|vendor|rfq|supplier/i, "fa-shopping-bag"],
    [/order|sale/i, "fa-shopping-cart"],
    [/customer|contact|partner|address/i, "fa-address-book-o"],
    [/product|catalog|variant/i, "fa-cube"],
    [/pricelist|price/i, "fa-tags"],
    [/transfer|deliver|receipt|shipping|picking/i, "fa-truck"],
    [/stock|inventory|warehouse|location/i, "fa-cubes"],
    [/manufactur|production|work ?order|bill of material|bom/i, "fa-industry"],
    [/team/i, "fa-users"],
    [/employee|department/i, "fa-id-badge"],
    [/user|salesperson|member/i, "fa-user"],
    [/calendar|meeting|schedul/i, "fa-calendar"],
    [/tag|label|categor/i, "fa-tags"],
    [/stage|step/i, "fa-list-ol"],
    [/project|task/i, "fa-tasks"],
    [/time ?sheet|attendance|time off|leave/i, "fa-hourglass-half"],
    [/expense/i, "fa-money"],
    [/discuss|message|chat|channel/i, "fa-comments-o"],
    [/mail|email/i, "fa-envelope-o"],
    [/website|page|blog/i, "fa-globe"],
    [/document|attachment|file/i, "fa-file-o"],
    [/plan/i, "fa-sitemap"],
    [/unit|uom|measure/i, "fa-balance-scale"],
    [/tax|fiscal/i, "fa-percent"],
    [/currenc/i, "fa-usd"],
    [/lost|reason|cancel/i, "fa-ban"],
    [/company/i, "fa-building-o"],
];

export function registryGet(source, key, fallback = null) {
    if (!source || !key) {
        return fallback;
    }
    if (typeof source.contains === "function") {
        return source.contains(key) ? source.get(key) : fallback;
    }
    if (source instanceof Map) {
        return source.has(key) ? source.get(key) : fallback;
    }
    return key in source ? source[key] : fallback;
}

export function guessIcon(node, config) {
    const explicit = registryGet(config?.icons, node.xmlid);
    if (explicit) {
        return explicit;
    }
    for (const [re, icon] of ICON_RULES) {
        if (re.test(node.name) || re.test(node.xmlid || "")) {
            return icon;
        }
    }
    return null;
}

/** Initials + a stable hue for apps without a real icon. */
export function generatedIcon(name) {
    const words = (name || "?").trim().split(/\s+/);
    const initials = (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
    let hash = 0;
    for (const ch of name || "") {
        hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    }
    return { initials, hue: hash };
}

export function appIcon(app) {
    const data = app.webIconData;
    if (data && !data.endsWith(DEFAULT_APP_ICON)) {
        return { src: data };
    }
    if (app.webIcon && typeof app.webIcon === "string") {
        const [iconClass, color, backgroundColor] = app.webIcon.split(",");
        if (iconClass && backgroundColor) {
            return { iconClass, color, backgroundColor };
        }
    }
    return { generated: generatedIcon(app.name) };
}

export function menuHref(menu) {
    if (!menu.actionID && !menu.actionPath) {
        return null;
    }
    return `/odoo/${menu.actionPath || "action-" + menu.actionID}`;
}

function asSet(value) {
    if (!value) {
        return new Set();
    }
    return value instanceof Set ? value : new Set(value);
}

function rank(order, xmlid) {
    const i = (order || []).indexOf(xmlid);
    return i === -1 ? 1000 : i;
}

/**
 * Normalised tree of one app: [{ id, name, xmlid, href, icon, children, depth, secondary }].
 * Applies the app's sidebar config (merge / hide / order) when one is registered.
 */
export function buildAppTree(menuService, app, config = null) {
    const root = menuService.getMenuAsTree(app.id);
    const replaced = new Set(asSet(config?.replaced)); // a copy: moved menus are added below
    const appXmlids = new Set((menuService.getApps?.() || []).map((a) => a.xmlid));
    for (const [xmlid, target] of movedMenus.getEntries()) {
        if (target !== app.xmlid && appXmlids.has(target)) {
            replaced.add(xmlid);
        }
    }
    const secondary = asSet(config?.secondary);
    const own = config?.ownPrefixes || [];
    const isOwn = (m) => own.some((p) => (m.xmlid || "").startsWith(p));

    const normalise = (menu, depth) => {
        if (replaced.has(menu.xmlid)) {
            return null;
        }
        const children = (menu.childrenTree || [])
            .map((child) => normalise(child, depth + 1))
            .filter(Boolean);
        const href = menuHref(menu);
        if (!children.length && !href) {
            return null;
        }
        const node = {
            id: menu.id,
            name: menu.name,
            xmlid: menu.xmlid || "",
            actionID: menu.actionID,
            actionPath: menu.actionPath,
            appID: menu.appID,
            href: children.length ? null : href,
            depth,
            children,
        };
        node.icon = guessIcon(node, config);
        return node;
    };

    let top = (root.childrenTree || []).map((m) => normalise(m, 0)).filter(Boolean);

    if (config && own.length) {
        // Odoo's own top menus are merged into one of the addon's groups when asked.
        const byXmlid = Object.fromEntries(top.map((n) => [n.xmlid, n]));
        const merged = [];
        for (const node of top) {
            const target = byXmlid[config.mergeInto?.[node.xmlid]];
            if (target && target !== node) {
                const leaves = node.children.length ? node.children : [node];
                target.children.push(...leaves.map((leaf) => ({ ...leaf, depth: target.depth + 1 })));
            } else {
                merged.push(node);
            }
        }
        top = merged;
        for (const node of top) {
            node.own = isOwn(node);
        }
    }
    const sortChildren = (nodes) => {
        for (const node of nodes) {
            const order = config?.childOrder?.[node.xmlid];
            if (order) {
                node.children.sort((a, b) => rank(order, a.xmlid) - rank(order, b.xmlid));
            }
            sortChildren(node.children);
        }
    };
    if (config?.order) {
        top.sort((a, b) => rank(config.order, a.xmlid) - rank(config.order, b.xmlid));
    }
    sortChildren(top);
    // Odoo entries an app wants among its everyday pages (e.g. Replenishment in Operations)
    if (config?.promote) {
        const byXmlid = Object.fromEntries(top.map((n) => [n.xmlid, n]));
        for (const [xmlid, targetXmlid] of Object.entries(config.promote)) {
            const target = byXmlid[targetXmlid];
            const found = target && takeNode(top, xmlid, target);
            if (found) {
                target.children.push({ ...found, depth: target.depth + 1, children: [] });
            }
        }
        top = top.filter((n) => n.children.length || n.href);
    }
    // Less used pages of the app's own groups go to the top bar ("More"), so the sidebar
    // keeps only the everyday pages. One heading per original group.
    if (config?.topbar) {
        const groups = new Map();
        for (const xmlid of asSet(config.topbar)) {
            const hit = takeLeaf(top, xmlid);
            if (!hit) {
                continue;
            }
            const key = hit.parent ? hit.parent.xmlid || hit.parent.name : "";
            if (!groups.has(key)) {
                groups.set(key, {
                    id: `moved_${app.id}_${groups.size}`,
                    name: hit.parent ? hit.parent.name : _t("More"),
                    xmlid: "",
                    appID: app.id,
                    href: null,
                    depth: 0,
                    icon: hit.parent?.icon || null,
                    children: [],
                    own: false,
                    moved: true,
                });
            }
            groups.get(key).children.push({ ...hit.node, depth: 1, children: [] });
        }
        top = top.filter((n) => n.children.length || n.href);
        top.push(...groups.values());
    }
    for (const node of top) {
        node.kind = topKind(node);
        // "Secondary" menus (Reporting, Configuration, rarely used Odoo groups) go to the
        // top bar, so the sidebar only lists the everyday pages.
        node.secondary =
            Boolean(node.moved) ||
            secondary.has(node.xmlid) ||
            node.kind !== "main" ||
            Boolean(config && own.length && !node.own);
    }
    if (!top.some((n) => !n.secondary)) {
        // Nothing would be left in the sidebar (e.g. the Settings app): keep everything there.
        for (const node of top) {
            node.secondary = false;
        }
    }
    top.sort((a, b) => Number(Boolean(a.secondary)) - Number(Boolean(b.secondary)));
    return top;
}

const REPORT_RE = /report|analys/i;
const CONFIG_RE = /config|setting/i;

/** "report" / "config" for an app's Reporting and Configuration menus, "main" otherwise. */
export function topKind(node) {
    const key = (node.xmlid || "").split(".").pop();
    if (REPORT_RE.test(key) || /^reporting$/i.test(node.name)) {
        return "report";
    }
    if (CONFIG_RE.test(key) || /^configuration$/i.test(node.name)) {
        return "config";
    }
    return "main";
}

/** Remove the leaf with this xmlid (anywhere in the tree) and return { node, parent }. */
function takeLeaf(nodes, xmlid, parent = null) {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.xmlid === xmlid && !node.children.length) {
            nodes.splice(i, 1);
            return { node, parent };
        }
        const found = takeLeaf(node.children, xmlid, node);
        if (found) {
            if (!node.children.length && !node.href) {
                nodes.splice(i, 1); // the group is now empty
            }
            return found;
        }
    }
    return null;
}

/** Remove the node with this xmlid from the (non-target) tree and return it. */
function takeNode(nodes, xmlid, skip) {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node === skip) {
            continue;
        }
        if (node.xmlid === xmlid && !node.children.length) {
            nodes.splice(i, 1);
            return node;
        }
        const found = takeNode(node.children, xmlid, skip);
        if (found) {
            if (!node.children.length && !node.href) {
                nodes.splice(i, 1); // the group is now empty
            }
            return found;
        }
    }
    return null;
}

/** The sidebar part of an app tree: its everyday pages. */
export function sideNodes(tree) {
    return tree.filter((n) => !n.secondary);
}

/** The top bar part: other Odoo groups first, then Reporting, then Configuration. */
export function topNodes(tree) {
    const top = tree.filter((n) => n.secondary);
    const main = top.filter((n) => (n.kind || "main") === "main");
    const result = [];
    if (main.length > 1 || main.some((n) => n.moved)) {
        // Several small groups (Orders, Products, Team…): one "More" menu, one heading each.
        const leaves = main.filter((n) => !n.children.length);
        // the app's own pages moved out of the sidebar first, then Odoo's other groups
        const groups = main.filter((n) => n.children.length).sort((a, b) => Number(!a.moved) - Number(!b.moved));
        result.push({
            id: `more_${main[0].appID || main[0].id}`,
            name: _t("More"),
            xmlid: "",
            kind: "main",
            icon: "fa-th-large",
            secondary: true,
            depth: 0,
            children: [...leaves, ...groups],
        });
    } else {
        result.push(...main);
    }
    result.push(...top.filter((n) => n.kind === "report"), ...top.filter((n) => n.kind === "config"));
    return result;
}

/** Depth-first list of leaves (items that open something). */
export function flattenLeaves(nodes, parents = []) {
    const result = [];
    for (const node of nodes) {
        if (node.children.length) {
            result.push(...flattenLeaves(node.children, [...parents, node]));
        } else if (node.href) {
            result.push({ node, parents });
        }
    }
    return result;
}

/**
 * Which leaf matches the current URL. The longest matching href wins, then the
 * last clicked menu (two menus can open the same action).
 */
export function findActiveLeaf(leaves, pathname, preferredId = null) {
    const path = (pathname || "").replace(/\/$/, "");
    let best = null;
    for (const entry of leaves) {
        const href = entry.node.href;
        if (path === href || path.startsWith(`${href}/`)) {
            if (
                !best ||
                href.length > best.node.href.length ||
                (href.length === best.node.href.length && entry.node.id === preferredId)
            ) {
                best = entry;
            }
        }
    }
    return best;
}
