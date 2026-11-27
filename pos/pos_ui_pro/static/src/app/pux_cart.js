import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

/**
 * The current order, drawn two ways:
 *   cart — e-commerce style item list (photo, name, stepper, amount)
 *   bill — a bill table with an add row (type or scan, Enter adds)
 * Totals below. Lines, prices and taxes are Odoo's own order model.
 */
export class PuxCart extends Component {
    static template = "pos_ui_pro.PuxCart";
    static props = {};

    setup() {
        this.pos = usePos();
        this.state = useState({ query: "", active: 0 });
    }
    get order() {
        return this.pos.getOrder();
    }
    get isBill() {
        return this.pos.puxUi?.style === "bill";
    }
    get lines() {
        return this.order ? this.order.getOrderlines() : [];
    }
    get itemCount() {
        return this.lines
            .filter((l) => !l.combo_parent_id)
            .reduce((sum, l) => sum + Math.max(l.getQuantity(), 0), 0);
    }
    get orderLabel() {
        const o = this.order;
        return o ? o.floatingOrderName || o.pos_reference || "" : "";
    }
    fmtQty(line) {
        return this.env.utils.formatProductQty(line.getQuantity(), false);
    }
    lineName(line) {
        return line.orderDisplayProductName?.name || line.full_product_name;
    }
    lineAttrs(line) {
        return line.orderDisplayProductName?.attributeString || "";
    }
    lineImage(line) {
        return this.pos.config.show_product_images && line.product_id?.getImageUrl?.();
    }
    lineDiscount(line) {
        const d = line.getDiscountStr?.();
        return d && d !== "0" ? `${d}%` : "";
    }
    select(line) {
        const order = this.order;
        if (line.isSelected()) {
            order.uiState.selected_orderline_uuid = null;
        } else {
            this.pos.selectOrderLine(order, line);
        }
    }
    step(line, delta) {
        const qty = line.getQuantity() + delta;
        if (qty <= 0) {
            this.order.removeOrderline(line);
        } else {
            line.setQuantity(qty);
        }
    }
    remove(line) {
        this.order.removeOrderline(line);
    }
    editCustomer() {
        this.pos.selectPartner();
    }

    // ---- bill style: type or scan to add ----
    get results() {
        const q = this.state.query.trim();
        if (!q) {
            return [];
        }
        const all = this.pos.models["product.template"].getAll().filter((p) => p.canBeDisplayed);
        return this.pos.getProductsBySearchWord(q, all).slice(0, 8);
    }
    priceOf(product) {
        return product.displayPriceUnit;
    }
    async add(product) {
        if (!product) {
            return;
        }
        await this.pos.addLineToCurrentOrder({ product_tmpl_id: product }, {});
        this.state.query = "";
        this.state.active = 0;
    }
    onKeydown(ev) {
        const results = this.results;
        if (ev.key === "ArrowDown") {
            this.state.active = Math.min(this.state.active + 1, results.length - 1);
            ev.preventDefault();
        } else if (ev.key === "ArrowUp") {
            this.state.active = Math.max(this.state.active - 1, 0);
            ev.preventDefault();
        } else if (ev.key === "Enter") {
            this.add(results[this.state.active] || results[0]);
            ev.preventDefault();
        } else if (ev.key === "Escape") {
            this.state.query = "";
        }
    }
}
