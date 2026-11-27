import { Component, onMounted, onWillStart, onWillUnmount, useExternalListener, useRef, useState } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { usePinApp } from "./app_context";
import { ProductDrawer, openQuickDrawer } from "./drawer";
import { APP_XMLID } from "./pages";
import { PsCustomerPicker, PsDayEndDialog, PsHeldDialog, PsPinDialog } from "./counter/dialogs";
import { flushQueue, isConnectionError, queueOrder, readQueue } from "./counter/offline";
import { printReceipt, printTemplate } from "./counter/print";
import { PsExpenseDialog, PsLabelsDialog, PsModifierDialog, PsQtyDialog, PsReturnDialog, PsStockToolDialog } from "./counter/tools";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { Dialog } from "@web/core/dialog/dialog";

const SHOP_KEY = "pos_modern.menu.shop";
// Counter layout per browser: "cart" (product grid + cart rail) or "bill" (bill table + product panel).
const LAYOUT_KEY = "pos_modern.menu.layout";
const GRID_KEY = "pos_modern.menu.bill_grid";
function readPref(key, fallback) {
    try {
        return window.localStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}
function storePref(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // private window: not remembered
    }
}

function readShop() {
    try {
        return Number(window.localStorage.getItem(SHOP_KEY)) || false;
    } catch {
        return false;
    }
}
function storeShop(id) {
    try {
        window.localStorage.setItem(SHOP_KEY, String(id || ""));
    } catch {
        // private window: not remembered
    }
}
export function newUuid() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Menu: the counter of every shop. Pick a category or scan a barcode, adjust the cart
 * (quantity, line and bill discount, note), pick the customer by mobile number, hold the
 * bill, then Pay: split the bill over cash / card / mobile wallets with the change
 * computed, and print the 58 / 80 mm receipt.
 *
 * Prices, taxes, offers and the order itself are computed by the server
 * (pos.config.pos_modern_quote / pos_modern_create_order, saved like the register does).
 *
 * Shop addons extend this screen with patch(PosMenu.prototype, …) and t-inherit of
 * pos_modern.Menu (the empty .ps-hook-* elements are the stable places to add things).
 */
export class PosMenu extends Component {
    static template = "pos_modern.Menu";
    static components = { PsCustomerPicker, Dropdown, DropdownItem };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.searchRef = useRef("search");
        this.billRef = useRef("billadd");
        usePinApp(APP_XMLID);
        const ctx = this.props.action?.context || {};
        this.state = useState({
            loading: true,
            data: null,
            category: "all",
            search: "",
            cart: [], // [{ key, id, qty, discount, note, extra, label }]
            billDiscount: 0,
            partner: false, // { id, name, phone }
            note: "",
            holdId: false,
            tableId: ctx.pos_modern_table_id || false,
            tableName: ctx.pos_modern_table_name || "",
            floorId: false,
            mode: "cart", // cart | pay
            printNext: false,
            payments: [], // [{ uid, method_id, amount, ref, phone }]
            pin: "",
            quote: null,
            quoteKey: "",
            editKey: false,
            openingCash: "",
            busy: false,
            done: null, // the order just paid
            error: "",
            queue: readQueue().length,
            online: true,
            extra: {}, // order-level values of shop addons
            layout: readPref(LAYOUT_KEY, "cart") === "bill" ? "bill" : "cart",
            showGrid: readPref(GRID_KEY, "1") === "1", // bill layout: product panel on the right
            billQuery: "",
            billActive: 0,
            mobTab: "menu", // phone: menu | order
        });
        this.orderUuid = newUuid();
        this.quoteTimer = null;
        this.quoteSeq = 0;
        this.lastReceipt = null;
        this.configId = ctx.pos_modern_config_id || readShop();
        this.startHold = ctx.pos_modern_hold_id || false;
        useExternalListener(window, "keydown", (ev) => this.onGlobalKey(ev));
        useExternalListener(window, "online", () => this.syncQueue());
        onWillStart(async () => {
            await this.load();
            if (this.startHold) {
                const row = await this.orm.call("pos.modern.hold", "pos_modern_take", [[this.startHold]]);
                this.takeHold(row);
            }
        });
        onMounted(() => {
            this.queueTimer = setInterval(() => this.state.queue && this.syncQueue(), 30000);
            if (this.state.queue) {
                this.syncQueue();
            }
        });
        onWillUnmount(() => {
            clearInterval(this.queueTimer);
            clearTimeout(this.quoteTimer);
        });
    }

    async load(configId = this.configId) {
        this.state.loading = !this.state.data;
        const data = await this.orm.call("pos.config", "pos_modern_menu", [configId || false]);
        this.configId = data.config_id;
        storeShop(data.config_id);
        this.state.data = data;
        this.state.online = true;
        this.state.loading = false;
        const floors = data.floors || [];
        if (floors.length && !floors.some((f) => f.id === this.state.floorId)) {
            this.state.floorId = floors[0].id;
        }
        this.scheduleQuote();
    }

    // ------------------------------------------------------------------ helpers
    get features() {
        return this.state.data?.features || {};
    }
    money(v) {
        const id = this.state.data?.currency_id;
        return id ? formatCurrency(v || 0, id) : String(round2(v));
    }
    price(p) {
        return this.state.data.tax_included ? p.incl : p.excl;
    }
    get methods() {
        return this.state.data?.payment_methods || [];
    }
    method(id) {
        return this.methods.find((m) => m.id === id);
    }

    // ------------------------------------------------------------------ catalog
    get categories() {
        return this.state.data?.categories || [];
    }
    get products() {
        const all = this.state.data?.products || [];
        const q = this.state.search.trim().toLowerCase();
        return all.filter((p) => {
            if (this.state.category !== "all" && !p.categ_ids.includes(this.state.category)) {
                return false;
            }
            return !q || this.matches(p, q);
        });
    }
    /** Search hay of a product (shop addons add generic names, Bangla names…). */
    matches(p, q) {
        return (
            p.name.toLowerCase().includes(q) ||
            (p.code || "").toLowerCase().includes(q) ||
            p.barcode === q ||
            (p.search_extra || "").toLowerCase().includes(q)
        );
    }
    productImage(p) {
        return `/web/image/product.product/${p.id}/image_256`;
    }
    categoryImage(c) {
        return `/web/image/pos.category/${c.id}/image_128`;
    }
    initials(name) {
        const words = String(name || "?").replace(/\[[^\]]*\]/g, "").trim().split(/\s+/);
        return ((words[0] || "?")[0] + (words.length > 1 ? words[1][0] : "")).toUpperCase();
    }
    tone(id) {
        return ["blue", "teal", "violet", "amber", "rose", "sky"][(id || 0) % 6];
    }
    stockState(p) {
        if (!this.features.show_stock || p.stock === undefined) {
            return "";
        }
        if (p.stock <= 0) {
            return "out";
        }
        return p.stock <= (this.features.low_stock || 0) ? "low" : "ok";
    }
    stockLabel(p) {
        const q = Math.round((p.stock || 0) * 100) / 100;
        return p.stock <= 0 ? _t("Out of stock") : `${q} ${p.uom || ""}`.trim();
    }
    setCategory(id) {
        this.state.category = id;
    }

    // ------------------------------------------------------------------ layout: cart | bill
    setLayout(layout) {
        this.state.layout = layout === "bill" ? "bill" : "cart";
        storePref(LAYOUT_KEY, this.state.layout);
        if (this.state.layout === "bill") {
            setTimeout(() => this.billRef.el?.focus(), 50);
        }
    }
    toggleGrid() {
        this.state.showGrid = !this.state.showGrid;
        storePref(GRID_KEY, this.state.showGrid ? "1" : "0");
    }
    /** Bill add row: best matches for what was typed or scanned. */
    get billResults() {
        const q = this.state.billQuery.trim().toLowerCase();
        if (!q) {
            return [];
        }
        const all = this.state.data?.products || [];
        const exact = all.filter((p) => p.barcode === q || (p.code || "").toLowerCase() === q);
        const rest = all.filter((p) => !exact.includes(p) && this.matches(p, q));
        return [...exact, ...rest].slice(0, 8);
    }
    billAdd(p) {
        if (p) {
            this.onProduct(p);
        }
        this.state.billQuery = "";
        this.state.billActive = 0;
        this.billRef.el?.focus();
    }
    async onBillKey(ev) {
        const rows = this.billResults;
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            this.state.billActive = Math.min(this.state.billActive + 1, Math.max(rows.length - 1, 0));
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            this.state.billActive = Math.max(this.state.billActive - 1, 0);
        } else if (ev.key === "Escape") {
            this.state.billQuery = "";
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            const q = this.state.billQuery.trim();
            if (!q) {
                return;
            }
            if (this.handleScan(q)) {
                this.state.billQuery = "";
                return;
            }
            if (rows.length) {
                this.billAdd(rows[this.state.billActive] || rows[0]);
            } else {
                await this.searchServer(q);
                this.state.billQuery = "";
            }
        }
    }
    async onSearchKey(ev) {
        if (ev.key !== "Enter") {
            return;
        }
        const q = this.state.search.trim();
        if (!q) {
            return;
        }
        if (this.handleScan(q)) {
            this.state.search = "";
            return;
        }
        const hit = (this.state.data?.products || []).find((p) => p.barcode && p.barcode === q);
        if (hit) {
            this.onProduct(hit);
            this.state.search = "";
        } else if (this.products.length === 1) {
            this.onProduct(this.products[0]);
            this.state.search = "";
        } else if (!this.products.length) {
            await this.searchServer(q);
        }
    }
    /** Shop addons read special barcodes here (weight / price barcodes, loyalty cards…). */
    handleScan(code) {
        return false;
    }
    async searchServer(q) {
        const rows = await this.orm.call("pos.config", "pos_modern_search_products", [[this.configId], q]);
        const known = new Set(this.state.data.products.map((p) => p.id));
        const fresh = rows.filter((r) => !known.has(r.id));
        this.state.data.products.push(...fresh);
        if (rows.length === 1) {
            this.onProduct(rows[0]);
            this.state.search = "";
        } else if (!rows.length) {
            this.notification.add(_t("No product found for “%s”", q), { type: "warning" });
        }
    }

    // ------------------------------------------------------------------ cart
    get byId() {
        return Object.fromEntries((this.state.data?.products || []).map((p) => [p.id, p]));
    }
    get cartLines() {
        const map = this.byId;
        const quoted = this.quoteFresh ? Object.fromEntries(this.state.quote.lines.map((l) => [l.key, l])) : {};
        return this.state.cart
            .map((line) => ({ ...line, product: map[line.id], quoted: quoted[line.key] }))
            .filter((line) => line.product);
    }
    /** Lines the server added (free items of an offer…). */
    get extraLines() {
        if (!this.quoteFresh) {
            return [];
        }
        const keys = new Set(this.state.cart.map((l) => l.key));
        return this.state.quote.lines.filter((l) => !keys.has(l.key));
    }
    qtyOf(p) {
        return this.state.cart.filter((l) => l.id === p.id).reduce((s, l) => s + l.qty, 0);
    }
    /** Click on a product card. Shop addons ask for a unit / lot / weight first. */
    onProduct(p) {
        if (this.features.block_no_stock && p.storable && p.stock !== undefined && p.stock - this.qtyOf(p) <= 0) {
            this.notification.add(_t("%s is out of stock.", p.name), { type: "warning" });
            return;
        }
        if (p.ask_qty) {
            this.dialog.add(PsQtyDialog, {
                title: p.name,
                unit: p.uom || "",
                price: this.price(p),
                money: (v) => this.money(v),
                onOk: (qty) => this.withModifiers(p, { qty }),
            });
            return;
        }
        this.withModifiers(p, {});
    }
    /** Ask the product's modifiers (extras / choices) when it has some, then add it. */
    withModifiers(p, opts) {
        const all = this.features.modifiers || [];
        const mods = (p.modifiers || []).map((id) => all.find((m) => m.id === id)).filter(Boolean);
        if (!mods.length) {
            return this.addProduct(p, opts);
        }
        this.dialog.add(PsModifierDialog, {
            product: p,
            modifiers: mods,
            money: (v) => this.money(v),
            onOk: (picked) => {
                if (!picked.length) {
                    return this.addProduct(p, opts);
                }
                const ids = picked.map((m) => m.id).sort((a, b) => a - b);
                this.addProduct(p, {
                    ...opts,
                    key: `${p.id}-m${ids.join(".")}`,
                    extra: { ...(opts.extra || {}), modifiers: ids },
                    label: picked.map((m) => m.name).join(", "),
                });
            },
        });
    }
    addProduct(p, opts = {}) {
        if (this.state.done) {
            this.newOrder();
        }
        if (this.state.mode === "pay") {
            this.state.mode = "cart";
        }
        const key = opts.key || String(p.id);
        const qty = opts.qty || 1;
        const line = this.state.cart.find((l) => l.key === key);
        if (line && !opts.separate) {
            line.qty = round2(line.qty + qty);
        } else {
            this.state.cart.push({
                key: opts.separate ? `${key}-${Date.now()}` : key,
                id: p.id,
                qty,
                discount: opts.discount || 0,
                note: opts.note || "",
                extra: opts.extra || {},
                label: opts.label || "",
            });
        }
        this.state.error = "";
        this.cartChanged();
    }
    findLine(line) {
        return this.state.cart.find((x) => x.key === line.key);
    }
    increase(line) {
        const l = this.findLine(line);
        if (l) {
            l.qty = round2(l.qty + 1);
            this.cartChanged();
        }
    }
    decrease(line) {
        const l = this.findLine(line);
        if (!l) {
            return;
        }
        l.qty = round2(l.qty - 1);
        if (l.qty <= 0) {
            this.removeLine(line);
            return;
        }
        this.cartChanged();
    }
    removeLine(line) {
        this.state.cart = this.state.cart.filter((x) => x.key !== line.key);
        if (this.state.editKey === line.key) {
            this.state.editKey = false;
        }
        this.cartChanged();
    }
    setQty(line, value) {
        const l = this.findLine(line);
        const qty = round2(Number(String(value).replace(",", ".")));
        if (!l || !(qty >= 0)) {
            return;
        }
        if (qty === 0) {
            this.removeLine(line);
            return;
        }
        l.qty = qty;
        this.cartChanged();
    }
    setLineDiscount(line, value) {
        const l = this.findLine(line);
        if (l) {
            l.discount = Math.max(0, Math.min(100, Number(value) || 0));
            this.cartChanged();
        }
    }
    setLineNote(line, value) {
        const l = this.findLine(line);
        if (l) {
            l.note = value;
        }
    }
    toggleEdit(line) {
        this.state.editKey = this.state.editKey === line.key ? false : line.key;
    }
    setBillDiscount(value) {
        this.state.billDiscount = Math.max(0, Math.min(100, Number(value) || 0));
        this.cartChanged();
    }
    clearCart() {
        Object.assign(this.state, {
            cart: [],
            error: "",
            billDiscount: 0,
            holdId: false,
            note: "",
            pin: "",
            mode: "cart",
            payments: [],
            editKey: false,
            extra: {},
        });
        this.orderUuid = newUuid();
        this.cartChanged();
    }
    lineTotal(line) {
        if (line.quoted) {
            return line.quoted.total;
        }
        return this.price(line.product) * line.qty * (1 - (line.discount || 0) / 100) * (1 - this.state.billDiscount / 100);
    }
    lineGross(line) {
        return line.quoted ? line.quoted.gross : this.price(line.product) * line.qty;
    }

    // ------------------------------------------------------------------ totals (server quote)
    get cartKey() {
        return JSON.stringify([
            this.state.cart.map((l) => [l.key, l.id, l.qty, l.discount, l.extra]),
            this.state.billDiscount,
            this.state.partner?.id || false,
            this.state.extra,
        ]);
    }
    get quoteFresh() {
        return Boolean(this.state.quote) && this.state.quoteKey === this.cartKey;
    }
    cartChanged() {
        this.scheduleQuote();
    }
    scheduleQuote() {
        clearTimeout(this.quoteTimer);
        if (!this.state.cart.length || !this.configId) {
            this.state.quote = null;
            return;
        }
        this.quoteTimer = setTimeout(() => this.fetchQuote(), 200);
    }
    async fetchQuote() {
        const key = this.cartKey;
        const seq = ++this.quoteSeq;
        try {
            const quote = await this.orm.silent.call("pos.config", "pos_modern_quote", [[this.configId], this.buildPayload()]);
            if (seq === this.quoteSeq) {
                this.state.quote = quote;
                this.state.quoteKey = key;
                this.state.online = true;
            }
        } catch (error) {
            if (isConnectionError(error)) {
                this.state.online = false;
            } else if (seq === this.quoteSeq) {
                this.state.error = error?.data?.message || error?.message || String(error);
            }
        }
    }
    get localTotal() {
        return this.state.cart.reduce((s, l) => {
            const p = this.byId[l.id];
            return p ? s + p.incl * l.qty * (1 - (l.discount || 0) / 100) * (1 - this.state.billDiscount / 100) : s;
        }, 0);
    }
    get localUntaxed() {
        return this.state.cart.reduce((s, l) => {
            const p = this.byId[l.id];
            return p ? s + p.excl * l.qty * (1 - (l.discount || 0) / 100) * (1 - this.state.billDiscount / 100) : s;
        }, 0);
    }
    get subtotal() {
        return this.quoteFresh ? this.state.quote.untaxed : this.localUntaxed;
    }
    get tax() {
        return this.quoteFresh ? this.state.quote.tax : this.localTotal - this.localUntaxed;
    }
    get total() {
        return this.quoteFresh ? this.state.quote.total : this.localTotal;
    }
    get discountAmount() {
        return this.quoteFresh ? this.state.quote.discount : 0;
    }
    get productDiscount() {
        return this.state.cart.reduce((s, l) => {
            const p = this.byId[l.id];
            return p ? s + p.excl * l.qty * ((l.discount || 0) / 100) : s;
        }, 0);
    }
    get extraDiscount() {
        return this.state.cart.reduce((s, l) => {
            const p = this.byId[l.id];
            return p ? s + p.excl * l.qty * (1 - (l.discount || 0) / 100) * ((this.state.billDiscount || 0) / 100) : s;
        }, 0);
    }
    get grossSubtotal() {
        return this.subtotal + this.productDiscount + this.extraDiscount;
    }
    get payable() {
        if (this.quoteFresh) {
            return this.state.quote.payable;
        }
        const r = this.features.rounding;
        return r ? Math.round(this.localTotal / r) * r : round2(this.localTotal);
    }
    get rounding() {
        return round2(this.payable - this.total);
    }
    get itemCount() {
        return round2(this.state.cart.reduce((s, l) => s + l.qty, 0));
    }
    get needsPin() {
        if (this.quoteFresh) {
            return this.state.quote.needs_pin;
        }
        const limit = this.features.discount_limit ?? 100;
        const max = Math.max(this.state.billDiscount, ...this.state.cart.map((l) => l.discount || 0));
        return limit < 100 && max > limit && !this.features.is_manager;
    }

    // ------------------------------------------------------------------ payload
    /** What the server prices and saves. Shop addons add keys (patch and call super). */
    buildPayload() {
        return {
            uuid: this.orderUuid,
            lines: this.state.cart.map((l) => ({
                key: l.key,
                product_id: l.id,
                qty: l.qty,
                discount: l.discount || 0,
                note: l.note || "",
                extra: l.extra || {},
            })),
            bill_discount: this.state.billDiscount || 0,
            partner_id: this.state.partner?.id || false,
            table_id: this.state.tableId || false,
            table_name: this.state.tableName || "",
            note: this.state.note || "",
            hold_id: this.state.holdId || false,
            extra: this.state.extra || {},
        };
    }

    // ------------------------------------------------------------------ session
    get session() {
        return this.state.data?.session;
    }
    get sessionOpen() {
        return this.session && this.session.state === "opened";
    }
    get sessionClosing() {
        return this.session && ["closing_control"].includes(this.session.state);
    }
    async openSession() {
        this.state.busy = true;
        try {
            await this.orm.call("pos.config", "pos_modern_open_session", [[this.configId], Number(this.state.openingCash) || 0, ""]);
            await this.load();
        } finally {
            this.state.busy = false;
        }
    }
    onShop(ev) {
        const id = Number(ev.target.value) || false;
        this.clearCart();
        this.state.done = null;
        this.state.category = "all";
        this.state.search = "";
        this.state.partner = false;
        return this.load(id);
    }
    dayEnd() {
        if (!this.session) {
            return;
        }
        this.dialog.add(PsDayEndDialog, {
            configId: this.configId,
            sessionId: this.session.id,
            onClosed: () => this.load(),
        });
    }
    openExpense() {
        if (!this.session) {
            this.notification.add(_t("Open the shop first: expenses are paid from the drawer."), { type: "warning" });
            return;
        }
        this.dialog.add(PsExpenseDialog, {
            configId: this.configId,
            currencyId: this.state.data.currency_id,
            onSaved: () => this.load(),
        });
    }
    openStockTool(mode) {
        this.dialog.add(PsStockToolDialog, {
            configId: this.configId,
            mode,
            onSaved: () => this.load(),
        });
    }

    // ------------------------------------------------------------------ customer
    setPartner(value) {
        this.state.partner = value || false;
        this.cartChanged();
    }

    // ------------------------------------------------------------------ hold bills
    async holdBill() {
        if (!this.state.cart.length || this.state.busy) {
            return;
        }
        const label = this.state.partner?.name || this.state.tableName || "";
        const row = await this.orm.call("pos.config", "pos_modern_hold", [[this.configId], this.buildPayload(), label]);
        this.notification.add(_t("Bill held: %s", row.name), { type: "info" });
        this.state.data.held_count = (this.state.data.held_count || 0) + (this.state.holdId ? 0 : 1);
        this.clearCart();
        this.state.partner = false;
        this.clearTable();
    }
    openHeld() {
        this.dialog.add(PsHeldDialog, {
            configId: this.configId,
            currencyId: this.state.data.currency_id,
            onTake: async (row) => {
                if (this.state.cart.length && this.state.holdId !== row.id) {
                    await this.holdBill();
                }
                this.takeHold(row);
            },
        });
    }
    takeHold(row) {
        const p = row.payload || {};
        const known = this.byId;
        this.state.cart = (p.lines || [])
            .filter((l) => known[l.product_id])
            .map((l) => ({
                key: l.key || String(l.product_id),
                id: l.product_id,
                qty: l.qty,
                discount: l.discount || 0,
                note: l.note || "",
                extra: l.extra || {},
                label: l.label || "",
            }));
        Object.assign(this.state, {
            billDiscount: p.bill_discount || 0,
            partner: row.partner ? { id: row.partner[0], name: row.partner[1] } : false,
            note: p.note || "",
            holdId: row.id,
            tableId: p.table_id || row.table_id || false,
            tableName: p.table_name || row.table_name || "",
            extra: p.extra || {},
            done: null,
            mode: "cart",
            mobTab: "order",
        });
        this.orderUuid = p.uuid || newUuid();
        this.cartChanged();
    }

    // ------------------------------------------------------------------ payment
    enterPay() {
        if (!this.cartLines.length || !this.sessionOpen) {
            return;
        }
        this.state.mode = "pay";
        this.state.mobTab = "order";
        this.state.error = "";
        if (!this.state.payments.length && Math.abs(this.payable) >= 0.005) {
            const m = this.methods.find((x) => x.is_cash) || this.methods[0];
            if (m) {
                this.state.payments.push(this.tender(m, this.payable));
            }
        }
    }
    backToCart() {
        this.state.mode = "cart";
        this.state.error = "";
        this.state.printNext = false;
    }
    tender(method, amount) {
        return { uid: newUuid(), method_id: method.id, amount: amount ? round2(amount) : "", ref: "", phone: "" };
    }
    /** Money given back (return / exchange worth more than the new items). */
    get isRefund() {
        return this.payable < 0;
    }
    /** The bill is covered: paid enough, or exactly the money to give back. */
    get settled() {
        if (this.payable < 0) {
            return Math.abs(this.paid - this.payable) < 0.005;
        }
        return this.paid >= this.payable - 0.004;
    }
    get paid() {
        return round2(this.state.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    }
    get remaining() {
        return round2(this.payable - this.paid);
    }
    get change() {
        return this.payable < 0 ? 0 : Math.max(0, round2(this.paid - this.payable));
    }
    addTender(method) {
        const left = this.remaining;
        if (this.payable < 0) {
            // money back: one line per method, the whole amount on the last one chosen
            this.state.payments = [this.tender(method, this.payable)];
            return;
        }
        const same = this.state.payments.find((p) => p.method_id === method.id && !p.ref);
        if (same && !method.needs_ref) {
            same.amount = round2((Number(same.amount) || 0) + Math.max(0, left));
            return;
        }
        // a single empty first line (default cash) is replaced by the chosen method
        if (this.state.payments.length === 1 && left <= 0 && !this.state.payments[0].ref) {
            this.state.payments = [this.tender(method, this.payable)];
            return;
        }
        this.state.payments.push(this.tender(method, Math.max(0, left)));
    }
    setTenderAmount(p, value) {
        p.amount = value;
        p.quick = false;
    }
    removeTender(p) {
        this.state.payments = this.state.payments.filter((x) => x.uid !== p.uid);
    }
    quickCash(note) {
        const cash = this.methods.find((m) => m.is_cash);
        if (!cash) {
            return;
        }
        let line = this.state.payments.find((p) => p.method_id === cash.id);
        if (!line) {
            line = this.tender(cash, 0);
            this.state.payments.push(line);
            line = this.state.payments.at(-1);
        }
        // tap 500 twice = 1000 given
        line.amount = line.quick ? round2((Number(line.amount) || 0) + note) : note;
        line.quick = true;
    }
    exactCash() {
        const cash = this.methods.find((m) => m.is_cash);
        if (!cash) {
            return;
        }
        const line = this.state.payments.find((p) => p.method_id === cash.id);
        const others = round2(this.paid - (line ? Number(line.amount) || 0 : 0));
        if (line) {
            line.amount = round2(this.payable - others);
            line.quick = false;
        } else {
            this.state.payments.push(this.tender(cash, this.payable - others));
        }
    }
    /** Shop addons check their own tender fields here (TrxID…); return an error text or "". */
    checkTenders() {
        for (const p of this.state.payments) {
            const m = this.method(p.method_id);
            if (m?.needs_ref && Number(p.amount) > 0 && !String(p.ref || "").trim()) {
                return _t("Type the transaction ID of %s.", m.name);
            }
        }
        return "";
    }
    async validate() {
        if (this.state.busy || !this.cartLines.length) {
            return;
        }
        if (this.state.mode !== "pay") {
            this.enterPay();
            return;
        }
        await this.fetchQuote();
        if (!this.settled) {
            this.state.error = this.payable < 0
                ? _t("Give back exactly %s.", this.money(-this.payable))
                : _t("%s still due.", this.money(this.remaining));
            return;
        }
        const tenderError = this.checkTenders();
        if (tenderError) {
            this.state.error = tenderError;
            return;
        }
        if (this.needsPin && !this.state.pin) {
            this.dialog.add(PsPinDialog, {
                configId: this.configId,
                onOk: (pin) => {
                    this.state.pin = pin;
                    this.validate();
                },
            });
            return;
        }
        const payload = {
            ...this.buildPayload(),
            pin: this.state.pin || "",
            payments: this.state.payments
                .filter((p) => Number(p.amount))
                .map((p) => ({ method_id: p.method_id, amount: Number(p.amount), ref: p.ref || "", phone: p.phone || "", extra: p.extra || {} })),
        };
        this.state.busy = true;
        this.state.error = "";
        try {
            const result = await this.orm.call("pos.config", "pos_modern_create_order", [[this.configId], payload]);
            this.orderPaid(result);
        } catch (error) {
            if (isConnectionError(error)) {
                this.orderOffline(payload);
            } else {
                throw error;
            }
        } finally {
            this.state.busy = false;
        }
    }
    orderPaid(result) {
        this.state.done = { ...result, change: result.receipt?.change ?? this.change };
        this.lastReceipt = result.receipt;
        if (this.state.data.session) {
            this.state.data.session.orders = (this.state.data.session.orders || 0) + 1;
        }
        if (this.state.holdId) {
            this.state.data.held_count = Math.max(0, (this.state.data.held_count || 1) - 1);
        }
        this.notification.add(_t("Order %s paid", result.name), { type: "success" });
        if ((this.features.auto_print || this.state.printNext) && result.receipt) {
            this.printReceipt(result.receipt);
        }
        this.state.printNext = false;
        this.resetAfterOrder();
    }
    orderOffline(payload) {
        const receipt = this.localReceipt(payload);
        this.state.queue = queueOrder(this.configId, payload, receipt);
        this.state.online = false;
        this.state.done = { name: receipt.ref, total: receipt.total, change: receipt.change, offline: true, receipt };
        this.lastReceipt = receipt;
        this.notification.add(_t("No connection: the order is kept and will be sent automatically."), { type: "warning" });
        if (this.features.auto_print || this.state.printNext) {
            this.printReceipt(receipt);
        }
        this.state.printNext = false;
        this.resetAfterOrder();
    }
    resetAfterOrder() {
        const keepTable = false;
        this.clearCart();
        this.state.partner = false;
        if (!keepTable) {
            this.clearTable();
        }
    }
    /** Receipt built in the browser for an order kept offline. */
    localReceipt(payload) {
        const d = this.state.data;
        const lines = this.cartLines.map((l) => ({
            name: l.product.name,
            qty: l.qty,
            uom: l.product.uom || "",
            price_unit: this.price(l.product),
            discount: l.discount,
            total: this.lineTotal(l),
            note: l.note,
            lots: [],
        }));
        return {
            ref: _t("OFFLINE-%s", payload.uuid.slice(0, 8).toUpperCase()),
            date: new Date().toLocaleString(),
            shop: d.config_name,
            cashier: d.user,
            customer: this.state.partner ? { name: this.state.partner.name, phone: this.state.partner.phone || "" } : false,
            company: d.company,
            header: d.receipt_header,
            footer: d.receipt_footer,
            width: this.features.receipt_width,
            currency_id: d.currency_id,
            lines,
            taxes: [],
            untaxed: this.subtotal,
            tax: this.tax,
            total: this.total,
            discount: this.discountAmount,
            paid: this.paid,
            change: this.change,
            payments: payload.payments.map((p) => ({ name: this.method(p.method_id)?.name || "", amount: p.amount, ref: p.ref })),
            note: payload.note,
            offline: true,
            extra: {},
        };
    }
    async syncQueue() {
        const res = await flushQueue(this.orm);
        this.state.queue = res.left;
        if (res.sent) {
            this.state.online = true;
            this.notification.add(_t("%s offline order(s) sent to the server.", res.sent), { type: "success" });
        }
    }
    printReceipt(receipt = this.lastReceipt) {
        if (receipt) {
            printReceipt(receipt);
        }
    }
    /** Kitchen ticket: what to cook, no prices. */
    printKOT() {
        if (!this.cartLines.length) {
            return;
        }
        printTemplate("pos_modern.KOT", {
            shop: this.state.data.config_name,
            order: this.orderNumber,
            table: this.state.tableName,
            note: this.state.note,
            now: new Date().toLocaleString(),
            lines: this.cartLines.map((l) => ({ qty: l.qty, name: l.product.name, note: l.note || "" })),
        }, "80");
    }
    /** Take the payment, then print the bill (receipt) once the order is saved. */
    billAndPrint() {
        if (!this.cartLines.length || this.state.busy) {
            return;
        }
        this.state.printNext = true;
        this.enterPay();
    }
    newBill() {
        if (this.state.busy) {
            return;
        }
        this.newOrder();
        this.clearTable();
    }
    newOrder() {
        Object.assign(this.state, { done: null, error: "", mobTab: "menu" });
        this.clearCart();
        this.state.partner = false;
    }
    openOrder() {
        if (this.state.done?.id) {
            return this.action.doAction({
                type: "ir.actions.act_window",
                res_model: "pos.order",
                res_id: this.state.done.id,
                views: [[false, "form"]],
                target: "current",
            });
        }
    }
    clearTable() {
        this.state.tableId = false;
        this.state.tableName = "";
    }

    // ------------------------------------------------------------------ dining / table
    get floors() {
        return this.state.data?.floors || [];
    }
    get floor() {
        return this.floors.find((f) => f.id === this.state.floorId);
    }
    get floorTables() {
        return this.floor?.tables || [];
    }
    get orderNumber() {
        const session = this.state.data?.session;
        return session ? (session.orders || 0) + 1 : 0;
    }
    onFloor(ev) {
        const id = Number(ev.target.value) || false;
        this.state.floorId = id;
        const ids = new Set(this.floorTables.map((t) => t.id));
        if (this.state.tableId && !ids.has(this.state.tableId)) {
            this.clearTable();
        }
    }
    onTable(ev) {
        const id = Number(ev.target.value) || false;
        if (!id) {
            this.clearTable();
            return;
        }
        const table = this.floorTables.find((t) => t.id === id);
        this.state.tableId = id;
        this.state.tableName = table ? `${this.floor.name} · ${_t("Table")} ${table.number}` : "";
    }

    // ------------------------------------------------------------------ keyboard
    get shortcuts() {
        return [
            ["F2", _t("Search")],
            ["F4", _t("Hold")],
            ["F6", _t("Customer")],
            ["F7", _t("Held bills")],
            ["F8", _t("Bill discount")],
            ["F9", _t("Pay")],
            ["F10", _t("Reprint")],
            ["Esc", _t("Back")],
        ];
    }
    onGlobalKey(ev) {
        if (!this.state.data?.config_id || document.querySelector(".modal.show, .o_dialog")) {
            return;
        }
        const handlers = {
            F2: () => (this.state.layout === "bill" ? this.billRef.el : this.searchRef.el)?.focus(),
            F4: () => this.holdBill(),
            F6: () => document.querySelector(".ps-cust input")?.focus(),
            F7: () => this.openHeld(),
            F8: () => document.querySelector(".ps-bill-discount input")?.focus(),
            F9: () => this.validate(),
            F10: () => this.printReceipt(),
            Escape: () => {
                if (this.state.mode === "pay") {
                    this.backToCart();
                } else if (this.state.search) {
                    this.state.search = "";
                }
            },
        };
        const handler = handlers[ev.key];
        if (handler) {
            if (ev.key === "Escape" && !["pay"].includes(this.state.mode) && !this.state.search) {
                return;
            }
            ev.preventDefault();
            handler();
        }
    }

    // ------------------------------------------------------------------ return / exchange
    openReturn() {
        this.dialog.add(PsReturnDialog, {
            configId: this.configId,
            currencyId: this.state.data.currency_id,
            onAdd: (order, rows) => this.takeBack(order, rows),
        });
    }
    takeBack(order, rows) {
        if (this.state.done) {
            this.newOrder();
        }
        const known = new Set(this.state.data.products.map((p) => p.id));
        this.state.data.products.push(...(order.products || []).filter((p) => !known.has(p.id)));
        for (const { line, qty } of rows) {
            const key = `r${line.id}`;
            const existing = this.state.cart.find((l) => l.key === key);
            if (existing) {
                existing.qty = -Math.min(line.left, Math.abs(existing.qty) + qty);
            } else {
                this.state.cart.push({
                    key,
                    id: line.product_id,
                    qty: -qty,
                    discount: 0,
                    note: "",
                    extra: { refund_line_id: line.id },
                    label: _t("Return from %s", order.ref),
                    refund: true,
                });
            }
        }
        if (!this.state.partner && order.partner) {
            this.state.partner = order.partner;
        }
        this.state.mode = "cart";
        this.cartChanged();
    }
    get hasReturn() {
        return this.state.cart.some((l) => l.qty < 0);
    }

    // ------------------------------------------------------------------ barcode labels
    openLabels() {
        const start = this.cartLines
            .filter((l) => l.qty > 0)
            .map((l) => ({ id: l.id, name: l.product.name, barcode: l.product.barcode, copies: Math.max(1, Math.round(l.qty)) }));
        this.dialog.add(PsLabelsDialog, {
            configId: this.configId,
            currencyId: this.state.data.currency_id,
            products: this.state.data.products,
            start,
            size: this.features.label_size || "50x30",
            shop: this.state.data.company?.name || "",
        });
    }

    // ------------------------------------------------------------------ header actions
    newProduct() {
        return openQuickDrawer(this.dialog, ProductDrawer, {}).then(() => this.load());
    }
    openSettings() {
        return this.orm.call("pos.config", "pos_modern_settings_action", [[this.configId]]).then((action) =>
            this.action.doAction(action, { onClose: () => this.load() })
        );
    }
    goTables() {
        return this.action.doAction("pos_modern.action_tables", {
            additionalContext: { pos_modern_config_id: this.configId },
        });
    }
    openRegister() {
        // Odoo's own register (full screen POS) for this shop
        return this.action.doAction({
            type: "ir.actions.act_url",
            url: `/pos/ui/${this.configId}`,
            target: "self",
        });
    }
}

registry.category("actions").add("pos_modern.menu", PosMenu);

/** Reserve a table: guest name, time and cover count (stored on a line-less hold). */
export class TablesReserveDialog extends Component {
    static template = "pos_modern.TablesReserve";
    static components = { Dialog };
    static props = { table: Object, onSave: Function, close: Function };

    setup() {
        const soon = new Date(Date.now() + 30 * 60000);
        const at = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;
        this.state = useState({ at, guests: 2, name: "" });
    }
    save() {
        this.props.onSave({
            at: this.state.at,
            guests: Number(this.state.guests) || 0,
            name: this.state.name.trim(),
        });
        this.props.close();
    }
}

/** Pick the items that move to the second bill of the table. */
export class TablesSplitDialog extends Component {
    static template = "pos_modern.TablesSplit";
    static components = { Dialog };
    static props = { detail: Object, money: Function, onSplit: Function, close: Function };

    setup() {
        this.state = useState({ keys: [] });
    }
    get items() {
        return this.props.detail?.items || [];
    }
    toggle(key) {
        this.state.keys = this.state.keys.includes(key)
            ? this.state.keys.filter((k) => k !== key)
            : [...this.state.keys, key];
    }
    get selectedTotal() {
        return this.items.filter((l) => this.state.keys.includes(l.key)).reduce((s, l) => s + (l.total || 0), 0);
    }
    get canSplit() {
        return this.state.keys.length > 0 && this.state.keys.length < this.items.length;
    }
    confirm() {
        if (!this.canSplit) {
            return;
        }
        this.props.onSplit(this.state.keys);
        this.props.close();
    }
}

/**
 * Tables: the restaurant floor plan. Floors, search and status pills on top; the floor
 * canvas on the left; the selected table's live bill with Add Items / Print KOT /
 * Split Bill / Settle Payment on the right. A table opens the Menu for it.
 */
export class PosTables extends Component {
    static template = "pos_modern.Tables";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        usePinApp(APP_XMLID);
        const ctx = this.props.action?.context || {};
        this.state = useState({
            loading: true,
            data: null,
            floorId: false,
            shops: [],
            query: "",
            filter: "all",
            selId: false,
            detail: null,
            now: Date.now(),
        });
        this.configId = ctx.pos_modern_config_id || readShop();
        this.presetTableId = ctx.pos_modern_table_id || false;
        onWillStart(() => this.load());
        onMounted(() => {
            this.clock = setInterval(() => (this.state.now = Date.now()), 30000);
            this.poller = setInterval(() => this.refresh(), 30000);
        });
        onWillUnmount(() => {
            clearInterval(this.clock);
            clearInterval(this.poller);
        });
    }
    async load(configId = this.configId, keep = false) {
        const data = await this.orm.call("pos.config", "pos_modern_tables", [configId || false]);
        this.state.data = data;
        this.state.shops = data.shops || [];
        this.configId = data.config_id || configId;
        this.loadedAt = Date.now();
        const floors = data.floors || [];
        if (!keep || !floors.some((f) => f.id === this.state.floorId)) {
            this.state.floorId = floors[0]?.id || false;
        }
        const ids = new Set((this.floor?.tables || []).map((t) => t.id));
        if (!keep || !ids.has(this.state.selId)) {
            this.state.selId = this.presetTableId && ids.has(this.presetTableId)
                ? this.presetTableId
                : (this.floor?.tables?.[0]?.id || false);
        }
        this.presetTableId = false;
        this.state.loading = false;
        await this.loadDetail();
    }
    async refresh() {
        if (!this.state.data?.installed) {
            return;
        }
        await this.load(this.configId, true);
    }
    async loadDetail(billId = false) {
        if (!this.state.selId) {
            this.state.detail = null;
            return;
        }
        this.state.detail = await this.orm.silent.call(
            "pos.config", "pos_modern_table_detail", [[this.configId], this.state.selId, billId || false]
        );
    }

    get floor() {
        return (this.state.data?.floors || []).find((f) => f.id === this.state.floorId);
    }
    get allTables() {
        return this.floor?.tables || [];
    }
    get tables() {
        const q = this.state.query.trim().toLowerCase();
        return this.allTables.filter((t) => {
            if (this.state.filter !== "all" && t.status !== this.state.filter) {
                return false;
            }
            return !q || String(t.number).includes(q) || (t.reserved?.name || "").toLowerCase().includes(q);
        });
    }
    get counts() {
        const counts = { all: this.allTables.length, available: 0, occupied: 0, reserved: 0, billing: 0 };
        for (const t of this.allTables) {
            counts[t.status] = (counts[t.status] || 0) + 1;
        }
        return counts;
    }
    get selected() {
        return this.allTables.find((t) => t.id === this.state.selId);
    }
    get detail() {
        return this.state.detail;
    }
    get filters() {
        return [
            ["all", _t("All")],
            ["available", _t("Available")],
            ["occupied", _t("Occupied")],
            ["reserved", _t("Reserved")],
            ["billing", _t("Billing")],
        ];
    }
    statusLabel(status) {
        return { available: _t("Available"), occupied: _t("Occupied"), reserved: _t("Reserved"), billing: _t("Bill printed") }[status] || "";
    }
    money(v) {
        return this.state.data?.currency_id ? formatCurrency(v || 0, this.state.data.currency_id) : String(v);
    }
    initials(name) {
        const words = String(name || "?").trim().split(/\s+/);
        return ((words[0] || "?")[0] + (words.length > 1 ? words[1][0] : "")).toUpperCase();
    }
    minutes(table) {
        const extra = Math.floor((this.state.now - (this.loadedAt || Date.now())) / 60000);
        return (table.minutes || 0) + extra;
    }
    elapsed(table) {
        const m = this.minutes(table);
        return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
    }
    setFloor(id) {
        this.state.floorId = id;
        this.state.selId = (this.floor?.tables || [])[0]?.id || false;
        this.state.detail = null;
        this.loadDetail();
    }
    select(table) {
        if (this.state.selId === table.id) {
            return;
        }
        this.state.selId = table.id;
        this.state.detail = null;
        this.loadDetail();
    }
    selectBill(billId) {
        this.loadDetail(billId);
    }
    onShop(ev) {
        const id = Number(ev.target.value) || false;
        storeShop(id);
        this.state.query = "";
        this.state.filter = "all";
        return this.load(id);
    }

    openMenu(billId = false) {
        const table = this.selected;
        if (!table) {
            return;
        }
        return this.action.doAction("pos_modern.action_menu", {
            additionalContext: {
                pos_modern_config_id: this.configId,
                pos_modern_table_id: table.id,
                pos_modern_table_name: `${this.floor?.name || ""} · ${_t("Table")} ${table.number}`,
                pos_modern_hold_id: billId || false,
            },
        });
    }
    addItems() {
        return this.openMenu(this.state.detail?.selected_bill_id);
    }
    settle() {
        return this.openMenu(this.state.detail?.selected_bill_id);
    }
    printKot() {
        const detail = this.state.detail;
        if (!detail?.items?.length) {
            return;
        }
        printTemplate("pos_modern.KOT", {
            shop: this.state.data.config_name,
            order: detail.table.number,
            table: `${this.floor?.name || ""} · ${_t("Table")} ${detail.table.number}`,
            note: "",
            now: new Date().toLocaleString(),
            lines: detail.items.map((l) => ({ qty: l.qty, name: l.name, note: l.note })),
        }, this.state.data.receipt_width);
    }
    split() {
        const detail = this.state.detail;
        if (!detail || (detail.items || []).length < 2) {
            this.notification.add(_t("At least two items are needed to split the bill."), { type: "warning" });
            return;
        }
        this.dialog.add(TablesSplitDialog, {
            detail,
            money: (v) => this.money(v),
            onSplit: async (keys) => {
                await this.orm.call("pos.config", "pos_modern_table_split", [[this.configId], detail.selected_bill_id, keys]);
                this.notification.add(_t("Bill split in two."), { type: "success" });
                await this.load(this.configId, true);
            },
        });
    }
    reserve() {
        const table = this.selected;
        if (!table) {
            return;
        }
        this.dialog.add(TablesReserveDialog, {
            table,
            onSave: async (vals) => {
                await this.orm.call("pos.config", "pos_modern_table_reserve",
                    [[this.configId], table.id, vals.at, vals.guests, vals.name]);
                await this.load(this.configId, true);
            },
        });
    }
    async cancelReservation() {
        const holdId = this.state.detail?.reserved?.hold_id;
        if (!holdId) {
            return;
        }
        await this.orm.call("pos.config", "pos_modern_table_unreserve", [[this.configId], holdId]);
        await this.load(this.configId, true);
    }
    async seat() {
        const table = this.selected;
        const holdId = this.state.detail?.reserved?.hold_id;
        if (holdId) {
            await this.orm.call("pos.config", "pos_modern_table_unreserve", [[this.configId], holdId]);
            await this.load(this.configId, true);
        }
        return this.openMenu(false);
    }
}

registry.category("actions").add("pos_modern.tables", PosTables);
