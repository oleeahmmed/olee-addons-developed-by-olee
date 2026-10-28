import { Component, onWillStart, useState } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { usePinApp } from "./app_context";
import { PsPicker, ProductDrawer, openQuickDrawer } from "./drawer";
import { APP_XMLID } from "./pages";

const SHOP_KEY = "pos_modern.menu.shop";

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

/**
 * Menu: the simple selling screen (like the shadcn POS app). Pick a category, tap
 * products, adjust quantities in "Your Cart", choose how the customer pays and
 * "Create Order". Prices, taxes, the session and the order itself are Odoo's own
 * (pos.config.pos_modern_create_order saves it like the register does).
 */
export class PosMenu extends Component {
    static template = "pos_modern.Menu";
    static components = { PsPicker };
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
            category: "all",
            search: "",
            cart: [], // [{ id, qty }]
            partner: false, // [id, name]
            methodId: false,
            tableId: ctx.pos_modern_table_id || false,
            tableName: ctx.pos_modern_table_name || "",
            openingCash: "",
            busy: false,
            done: null, // the order just created
            error: "",
        });
        this.configId = ctx.pos_modern_config_id || readShop();
        onWillStart(() => this.load());
    }

    async load(configId = this.configId) {
        this.state.loading = !this.state.data;
        const data = await this.orm.call("pos.config", "pos_modern_menu", [configId || false]);
        this.configId = data.config_id;
        storeShop(data.config_id);
        this.state.data = data;
        const methods = data.payment_methods || [];
        if (!methods.some((m) => m.id === this.state.methodId)) {
            this.state.methodId = (methods.find((m) => m.is_cash) || methods[0])?.id || false;
        }
        this.state.loading = false;
    }

    // ---------- money ----------
    money(v) {
        const id = this.state.data?.currency_id;
        return id ? formatCurrency(v || 0, id) : String(v || 0);
    }
    price(p) {
        return this.state.data.tax_included ? p.incl : p.excl;
    }

    // ---------- catalog ----------
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
            if (!q) {
                return true;
            }
            return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.barcode === q;
        });
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
    setCategory(id) {
        this.state.category = id;
    }
    onSearchKey(ev) {
        if (ev.key === "Enter") {
            const q = this.state.search.trim();
            const hit = (this.state.data?.products || []).find((p) => p.barcode && p.barcode === q);
            if (hit) {
                this.add(hit);
                this.state.search = "";
            } else if (this.products.length === 1) {
                this.add(this.products[0]);
                this.state.search = "";
            }
        }
    }

    // ---------- cart ----------
    get byId() {
        return Object.fromEntries((this.state.data?.products || []).map((p) => [p.id, p]));
    }
    get cartLines() {
        const map = this.byId;
        return this.state.cart
            .map((line) => ({ ...line, product: map[line.id] }))
            .filter((line) => line.product);
    }
    qtyOf(p) {
        return this.state.cart.find((l) => l.id === p.id)?.qty || 0;
    }
    add(p) {
        if (this.state.done) {
            this.newOrder();
        }
        const line = this.state.cart.find((l) => l.id === p.id);
        if (line) {
            line.qty += 1;
        } else {
            this.state.cart.push({ id: p.id, qty: 1 });
        }
        this.state.error = "";
    }
    increase(line) {
        const l = this.state.cart.find((x) => x.id === line.id);
        if (l) {
            l.qty += 1;
        }
    }
    decrease(line) {
        const l = this.state.cart.find((x) => x.id === line.id);
        if (!l) {
            return;
        }
        l.qty -= 1;
        if (l.qty <= 0) {
            this.state.cart = this.state.cart.filter((x) => x.id !== line.id);
        }
    }
    clearCart() {
        this.state.cart = [];
        this.state.error = "";
    }
    get subtotal() {
        return this.cartLines.reduce((s, l) => s + l.product.excl * l.qty, 0);
    }
    get tax() {
        return this.cartLines.reduce((s, l) => s + (l.product.incl - l.product.excl) * l.qty, 0);
    }
    get total() {
        return this.subtotal + this.tax;
    }
    get itemCount() {
        return this.state.cart.reduce((s, l) => s + l.qty, 0);
    }

    // ---------- session ----------
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
        this.state.cart = [];
        this.state.done = null;
        this.state.category = "all";
        return this.load(id);
    }

    // ---------- order ----------
    setPartner(value) {
        this.state.partner = value || false;
    }
    async createOrder() {
        if (!this.cartLines.length || this.state.busy) {
            return;
        }
        if (!this.state.methodId) {
            this.state.error = _t("Choose how the customer pays.");
            return;
        }
        this.state.busy = true;
        this.state.error = "";
        try {
            const result = await this.orm.call("pos.config", "pos_modern_create_order", [
                [this.configId],
                this.state.cart.map((l) => ({ product_id: l.id, qty: l.qty })),
                this.state.methodId,
                this.state.partner ? this.state.partner[0] : false,
                this.state.tableId || false,
            ]);
            this.state.done = result;
            this.state.cart = [];
            this.notification.add(_t("Order %s paid", result.name), { type: "success" });
        } finally {
            this.state.busy = false;
        }
    }
    newOrder() {
        Object.assign(this.state, { done: null, cart: [], partner: false, error: "" });
    }
    openOrder() {
        if (this.state.done) {
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

    // ---------- header actions ----------
    addProduct() {
        return openQuickDrawer(this.dialog, ProductDrawer, {}).then(() => this.load());
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

/** Tables of a restaurant shop: free / occupied; a table opens the Menu for it. */
export class PosTables extends Component {
    static template = "pos_modern.Tables";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        usePinApp(APP_XMLID);
        const ctx = this.props.action?.context || {};
        this.state = useState({ loading: true, data: null, floorId: false, shops: [] });
        this.configId = ctx.pos_modern_config_id || readShop();
        onWillStart(() => this.load());
    }
    async load(configId = this.configId) {
        const data = await this.orm.call("pos.config", "pos_modern_tables", [configId || false]);
        this.state.data = data;
        this.state.shops = data.shops || [];
        this.configId = data.config_id || configId;
        if (!data.floors.some((f) => f.id === this.state.floorId)) {
            this.state.floorId = data.floors[0]?.id || false;
        }
        this.state.loading = false;
    }
    get floor() {
        return (this.state.data?.floors || []).find((f) => f.id === this.state.floorId);
    }
    onShop(ev) {
        const id = Number(ev.target.value) || false;
        storeShop(id);
        return this.load(id);
    }
    openTable(table) {
        return this.action.doAction("pos_modern.action_menu", {
            additionalContext: {
                pos_modern_config_id: this.configId,
                pos_modern_table_id: table.id,
                pos_modern_table_name: `${this.floor?.name || ""} · ${_t("Table")} ${table.number}`,
            },
        });
    }
}

registry.category("actions").add("pos_modern.tables", PosTables);
