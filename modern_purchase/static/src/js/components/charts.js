import { Component, useState } from "@odoo/owl";

/** Single-series area chart with crosshair + tooltip; text stays in text tokens. */
export class AreaChart extends Component {
    static template = "modern_purchase.AreaChart";
    static props = {
        data: Array, // [{ label, value }]
        label: String,
        format: Function,
        formatAxis: Function,
    };

    setup() {
        this.W = 640;
        this.H = 220;
        this.P = { t: 12, r: 12, b: 26, l: 48 };
        this.state = useState({ hover: null });
    }

    get max() {
        return Math.max(1, ...this.props.data.map((d) => d.value)) * 1.15;
    }
    x(i) {
        const n = Math.max(1, this.props.data.length - 1);
        return this.P.l + (i * (this.W - this.P.l - this.P.r)) / n;
    }
    y(v) {
        return this.H - this.P.b - (v / this.max) * (this.H - this.P.t - this.P.b);
    }
    get line() {
        return this.props.data.map((d, i) => `${i ? "L" : "M"}${this.x(i)},${this.y(d.value)}`).join(" ");
    }
    get area() {
        const n = this.props.data.length - 1;
        return `${this.line} L${this.x(n)},${this.H - this.P.b} L${this.x(0)},${this.H - this.P.b} Z`;
    }
    get ticks() {
        return [0, 0.25, 0.5, 0.75, 1].map((t) => t * this.max);
    }
    get last() {
        return this.props.data.length - 1;
    }
    get summary() {
        return this.props.data.map((d) => `${d.label}: ${this.props.format(d.value)}`).join(", ");
    }
    onMove(ev) {
        const rect = ev.currentTarget.getBoundingClientRect();
        const px = ((ev.clientX - rect.left) / rect.width) * this.W;
        const i = Math.round(((px - this.P.l) / (this.W - this.P.l - this.P.r)) * this.last);
        this.state.hover = Math.max(0, Math.min(this.last, i));
    }
}

/** Horizontal magnitude bars in one hue, with direct labels. */
export class BarList extends Component {
    static template = "modern_purchase.BarList";
    static props = {
        items: Array, // [{ id, label, value, sub? }]
        format: Function,
        onClick: { type: Function, optional: true },
    };
    width(v) {
        const max = Math.max(1, ...this.props.items.map((i) => i.value));
        return Math.max(2, (v / max) * 100);
    }
}
