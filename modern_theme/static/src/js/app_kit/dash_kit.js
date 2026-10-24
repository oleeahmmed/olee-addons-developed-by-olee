/** @odoo-module */
// Owner dashboard kit of the modern apps (Sales, Purchase, Inventory, Manufacturing, Contacts, Invoicing): KPI tiles, charts, lists.
// Pure presentation: every number comes from the server, read with the user's rights.
import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { currencies, formatCurrency } from "@web/core/currency";
import { serializeDateTime } from "@web/core/l10n/dates";

/**
 * Domain value for "from the start of this day" on a datetime field: the user's local
 * midnight, converted to UTC as Odoo stores it (a plain "YYYY-MM-DD 00:00:00" would be
 * read as UTC midnight and shift every period by the timezone offset).
 */
export function dayStart(isoDate) {
    return serializeDateTime(luxon.DateTime.fromISO(isoDate).startOf("day"));
}

const TONES = ["blue", "teal", "violet", "amber", "rose", "sky", "slate"];

function trim(n, digits) {
    return Number(n.toFixed(digits)).toString();
}

/**
 * Money formatters for a currency. With BDT the figures read the Bangladeshi way:
 * ৳ 12,34,567 in full and ৳ 12.35 L / ৳ 1.25 Cr in short.
 */
export function moneyFormatters(currencyId, lakh) {
    const fmt = baseMoneyFormatters(currencyId, lakh);
    /**
     * Amount of one record (an order, a bill...) in that record's own currency:
     * `currency` is its currency_id ([id, name] or id). Totals stay in the company currency.
     */
    fmt.record = (v, currency, short = false) => {
        const id = Array.isArray(currency) ? currency[0] : currency;
        if (id && id !== currencyId && currencies[id]) {
            return formatCurrency(v || 0, id, short ? { humanReadable: true, digits: [69, 1] } : {});
        }
        return short ? fmt.short(v) : fmt.full(v);
    };
    return fmt;
}

function baseMoneyFormatters(currencyId, lakh) {
    const cur = currencies[currencyId] || { symbol: "", position: "before" };
    if (!lakh) {
        numberLocale = undefined;
        return {
            full: (v) => formatCurrency(v || 0, currencyId, { digits: [69, 0] }),
            short: (v) => formatCurrency(v || 0, currencyId, { humanReadable: true, digits: [69, 1] }),
            axis: (v) => formatCurrency(v || 0, currencyId, { humanReadable: true, digits: [69, 0] }),
        };
    }
    numberLocale = "en-IN";
    const group = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
    const sign = (v) => (v < 0 ? "-" : "");
    const short = (v, digits = 2) => {
        const a = Math.abs(v || 0);
        let body;
        if (a >= 1e7) {
            body = `${trim(a / 1e7, digits)} Cr`;
        } else if (a >= 1e5) {
            body = `${trim(a / 1e5, digits)} L`;
        } else if (a >= 1e3) {
            body = `${trim(a / 1e3, 1)}K`;
        } else {
            body = group.format(Math.round(a));
        }
        return `${sign(v)}${cur.symbol} ${body}`;
    };
    return {
        full: (v) => `${sign(v)}${cur.symbol} ${group.format(Math.round(Math.abs(v || 0)))}`,
        short: (v) => short(v, 2),
        axis: (v) => short(v, 1),
    };
}

export function pct(v) {
    return v === null || v === undefined ? "—" : `${Math.round(v)}%`;
}

let numberLocale; // browser locale; "en-IN" (lakh/crore grouping) once a BDT dashboard loaded
export function number(v) {
    return new Intl.NumberFormat(numberLocale).format(v || 0);
}

/** Tiny area sparkline. */
export class OdSparkline extends Component {
    static template = "modern_theme.OdSparkline";
    static props = { values: Array, tone: { type: String, optional: true } };
    get points() {
        const v = this.props.values.length ? this.props.values : [0];
        const max = Math.max(...v, 1e-9);
        const min = Math.min(...v, 0);
        const span = max - min || 1;
        const w = 100;
        const h = 32;
        return v.map((x, i) => [v.length > 1 ? (i * w) / (v.length - 1) : w, h - 2 - ((x - min) / span) * (h - 6)]);
    }
    get line() {
        return this.points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    }
    get area() {
        return `${this.line} L100,32 L0,32 Z`;
    }
    get flat() {
        return !this.props.values.some((v) => v);
    }
    get gid() {
        return `od-spark-${this.props.tone || "blue"}`;
    }
}

/** KPI tile: value, change vs the previous period, a hint and a 12-month sparkline. */
export class OdKpi extends Component {
    static template = "modern_theme.OdKpi";
    static components = { OdSparkline };
    static props = {
        label: String,
        value: String,
        hint: { type: String, optional: true },
        delta: { optional: true },
        deltaSuffix: { type: String, optional: true }, // "%" (growth) or " pts" (rate change)
        invert: { type: Boolean, optional: true }, // lower is better
        spark: { type: Array, optional: true },
        tone: { type: String, optional: true },
        icon: { type: String, optional: true },
        featured: { type: Boolean, optional: true },
        onClick: { type: Function, optional: true },
        compareLabel: { type: String, optional: true },
    };
    get trend() {
        const d = this.props.delta;
        if (d === null || d === undefined) {
            return null;
        }
        const good = this.props.invert ? d < 0 : d > 0;
        return {
            dir: d > 0 ? "up" : d < 0 ? "down" : "flat",
            good: d === 0 ? null : good,
            text: `${d > 0 ? "+" : ""}${Math.abs(d) >= 100 ? Math.round(d) : d}${this.props.deltaSuffix || "%"}`,
        };
    }
}

/** 12 months: this year as bars, last year as a line; hover for both and the growth. */
export class OdComboChart extends Component {
    static template = "modern_theme.OdComboChart";
    static props = {
        data: Array, // [{ label, value, previous, future }]
        format: Function,
        formatAxis: Function,
        currentLabel: String,
        previousLabel: String,
        label: String,
    };
    setup() {
        this.W = 760;
        this.H = 260;
        this.P = { t: 16, r: 8, b: 28, l: 56 };
        this.state = useState({ hover: null });
    }
    get max() {
        return Math.max(1, ...this.props.data.flatMap((d) => [d.value, d.previous])) * 1.12;
    }
    get band() {
        return (this.W - this.P.l - this.P.r) / this.props.data.length;
    }
    cx(i) {
        return this.P.l + this.band * (i + 0.5);
    }
    y(v) {
        return this.H - this.P.b - (v / this.max) * (this.H - this.P.t - this.P.b);
    }
    barH(v) {
        return Math.max(0, this.H - this.P.b - this.y(v));
    }
    get barW() {
        return Math.min(34, this.band * 0.56);
    }
    get prevLine() {
        return this.props.data.map((d, i) => `${i ? "L" : "M"}${this.cx(i)},${this.y(d.previous)}`).join(" ");
    }
    get hasPrevious() {
        return this.props.data.some((d) => d.previous);
    }
    get ticks() {
        return [0, 0.25, 0.5, 0.75, 1].map((t) => t * this.max);
    }
    get totals() {
        const done = this.props.data.filter((d) => !d.future);
        const cur = done.reduce((s, d) => s + d.value, 0);
        const prev = done.reduce((s, d) => s + d.previous, 0);
        return { cur, prev, growth: prev ? ((cur - prev) * 100) / prev : null };
    }
    get hovered() {
        const i = this.state.hover;
        if (i === null) {
            return null;
        }
        const d = this.props.data[i];
        return { ...d, i, growth: d.previous ? ((d.value - d.previous) * 100) / d.previous : null };
    }
    onMove(ev) {
        const rect = ev.currentTarget.getBoundingClientRect();
        const px = ((ev.clientX - rect.left) / rect.width) * this.W;
        const i = Math.floor((px - this.P.l) / this.band);
        this.state.hover = i >= 0 && i < this.props.data.length ? i : null;
    }
    get summary() {
        return this.props.data.map((d) => `${d.label}: ${this.props.format(d.value)}`).join(", ");
    }
}

/** Share of a whole: donut + legend with percentages. */
export class OdDonut extends Component {
    static template = "modern_theme.OdDonut";
    static props = {
        items: Array, // [{ id, label, value }]
        format: Function,
        centerLabel: String,
        onClick: { type: Function, optional: true },
    };
    setup() {
        this.state = useState({ hover: null });
    }
    get total() {
        return this.props.items.reduce((s, i) => s + Math.max(0, i.value), 0);
    }
    get arcs() {
        const total = this.total || 1;
        const r = 42;
        const c = 2 * Math.PI * r;
        let offset = 0;
        return this.props.items.map((item, i) => {
            const share = Math.max(0, item.value) / total;
            const arc = { ...item, i, tone: TONES[i % TONES.length], share, dash: `${Math.max(0, share * c - 1.5)} ${c}`, offset: -offset };
            offset += share * c;
            return arc;
        });
    }
    get center() {
        const h = this.state.hover;
        if (h !== null && this.arcs[h]) {
            return { label: this.arcs[h].label, value: `${Math.round(this.arcs[h].share * 100)}%` };
        }
        return { label: this.props.centerLabel, value: this.props.format(this.total) };
    }
}

/** Pipeline funnel: one row per stage, bar width by amount, count + amount + share. */
export class OdFunnel extends Component {
    static template = "modern_theme.OdFunnel";
    static props = { stages: Array, format: Function, onClick: { type: Function, optional: true } };
    get max() {
        return Math.max(1, ...this.props.stages.map((s) => s.value));
    }
    get maxCount() {
        return Math.max(1, ...this.props.stages.map((s) => s.count));
    }
    width(s) {
        if (!s.value && !s.count) {
            return 0;
        }
        const byValue = s.value / this.max;
        const byCount = s.count / this.maxCount;
        return Math.max(4, Math.max(byValue, byCount * 0.6) * 100);
    }
}

/** Ranked horizontal bars with optional avatar and a secondary line. */
export class OdRank extends Component {
    static template = "modern_theme.OdRank";
    static props = {
        items: Array, // [{ id, label, value, sub?, avatar? (res.users id), partner? (res.partner id) }]
        format: Function,
        tone: { type: String, optional: true },
        onClick: { type: Function, optional: true },
        numbered: { type: Boolean, optional: true },
    };
    width(v) {
        const max = Math.max(1, ...this.props.items.map((i) => i.value));
        return Math.max(2, (v / max) * 100);
    }
    avatar(item) {
        if (item.avatar) {
            return `/web/image/res.users/${item.avatar}/avatar_128`;
        }
        return null;
    }
    initials(label) {
        const words = String(label || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
        return ((words[0] || "?")[0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
    }
    mono(item) {
        return TONES[(item.id || 0) % TONES.length];
    }
}

/** What needs the owner's attention now: one row per check, count + optional amount. */
export class OdAttention extends Component {
    static template = "modern_theme.OdAttention";
    static props = { items: Array, format: Function, onClick: { type: Function, optional: true } };
    get clear() {
        return !this.props.items.some((i) => i.count);
    }
}

/** Stacked bar of amounts by bucket (receivables ageing). */
export class OdStack extends Component {
    static template = "modern_theme.OdStack";
    static props = { items: Array, format: Function, tones: { type: Array, optional: true } };
    get total() {
        return this.props.items.reduce((s, i) => s + Math.max(0, i.value), 0);
    }
    tone(i) {
        return (this.props.tones || ["teal", "amber", "orange", "rose", "red"])[i] || "slate";
    }
    share(v) {
        return this.total ? (Math.max(0, v) * 100) / this.total : 0;
    }
}

/** Period switch (This month / Quarter / Year) and team filter. */
export class OdFilters extends Component {
    static template = "modern_theme.OdFilters";
    static props = {
        period: String,
        teamId: { optional: true },
        teams: Array,
        onChange: Function,
        busy: { type: Boolean, optional: true },
        allLabel: { type: String, optional: true },
        icon: { type: String, optional: true },
        label: { type: String, optional: true },
    };
    get periods() {
        return [
            { key: "month", label: _t("Month") },
            { key: "quarter", label: _t("Quarter") },
            { key: "year", label: _t("Year") },
        ];
    }
    onTeam(ev) {
        this.props.onChange({ teamId: ev.target.value ? Number(ev.target.value) : false });
    }
}

/** Shown instead of the dashboard when it could not be loaded. */
export class OdError extends Component {
    static template = "modern_theme.OdError";
    static props = { message: { type: String, optional: true }, onRetry: Function };
}


// ---------------------------------------------------------------------------
// shadcn-style blocks (shadcnuikit dashboards): goal banner, progress list, tasks,
// data table with pagination, activity feed, status tiles
// ---------------------------------------------------------------------------

/** Initials and a stable tone for a name (avatars without a picture). */
export function initialsOf(label) {
    const words = String(label || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
    return ((words[0] || "?")[0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
export function toneOf(seed) {
    let h = 0;
    for (const ch of String(seed || "")) {
        h = (h * 31 + ch.charCodeAt(0)) % 997;
    }
    return TONES[h % TONES.length];
}

/** "Your target is 48% complete": banner with a progress bar and one action. */
export class OdGoal extends Component {
    static template = "modern_theme.OdGoal";
    static props = {
        title: String,
        text: { type: String, optional: true },
        pct: Number,
        actionLabel: { type: String, optional: true },
        onAction: { type: Function, optional: true },
        icon: { type: String, optional: true },
    };
    get width() {
        return Math.max(0, Math.min(100, this.props.pct || 0));
    }
    get rounded() {
        return Math.round(this.props.pct || 0);
    }
}

/** Rows of label · value with a thin progress bar (pipeline stages, locations, products). */
export class OdProgressList extends Component {
    static template = "modern_theme.OdProgressList";
    static props = {
        items: Array, // [{ id, label, value (text), sub?, pct (0-100), tone?, delta? }]
        onClick: { type: Function, optional: true },
        tone: { type: String, optional: true },
    };
    barWidth(item) {
        const pct = Math.max(0, Math.min(100, item.pct || 0));
        return pct && pct < 2 ? 2 : pct;
    }
}

/** Task list: checkbox, title, description, priority and due badges. */
export class OdTasks extends Component {
    static template = "modern_theme.OdTasks";
    static props = {
        items: Array, // [{ id, title, sub?, priority?: "high"|"medium"|"low", due?, dueTone? }]
        onToggle: { type: Function, optional: true },
        onClick: { type: Function, optional: true },
        emptyText: { type: String, optional: true },
    };
    setup() {
        this.state = useState({ done: {} });
    }
    priorityLabel(p) {
        return { high: _t("High"), medium: _t("Medium"), low: _t("Low") }[p] || "";
    }
    async toggle(item, ev) {
        ev.stopPropagation();
        if (!this.props.onToggle || this.state.done[item.id]) {
            return;
        }
        this.state.done[item.id] = true;
        try {
            await this.props.onToggle(item);
        } catch (e) {
            this.state.done[item.id] = false;
            throw e;
        }
    }
}

/**
 * Data table (shadcn): header, rows with person / badge / money cells, row click and a
 * pager "1 - 7 of 24 leads" with previous / next. Columns:
 *   { key, label, type?: "text"|"person"|"badge"|"num"|"muted", align?: "end" }
 * A person cell reads row[key] (name) and row[key + "_sub"]; a badge reads row[key + "_tone"].
 */
export class OdTable extends Component {
    static template = "modern_theme.OdTable";
    static props = {
        columns: Array,
        rows: Array,
        pageSize: { type: Number, optional: true },
        unit: { type: String, optional: true },
        onRowClick: { type: Function, optional: true },
        emptyText: { type: String, optional: true },
    };
    setup() {
        this.state = useState({ page: 0 });
        this.initials = initialsOf;
        this.toneOf = toneOf;
    }
    get size() {
        return this.props.pageSize || 7;
    }
    get pages() {
        return Math.max(1, Math.ceil(this.props.rows.length / this.size));
    }
    get page() {
        return Math.min(this.state.page, this.pages - 1);
    }
    get visible() {
        const start = this.page * this.size;
        return this.props.rows.slice(start, start + this.size);
    }
    get range() {
        const total = this.props.rows.length;
        if (!total) {
            return "0";
        }
        const start = this.page * this.size + 1;
        return `${start} - ${Math.min(total, start + this.size - 1)} ${_t("of")} ${total}`;
    }
    go(step) {
        this.state.page = Math.max(0, Math.min(this.pages - 1, this.page + step));
    }
}

/** Recent activity: avatar initials, who, what, when. */
export class OdFeed extends Component {
    static template = "modern_theme.OdFeed";
    static props = {
        items: Array, // [{ id, name, text, time, avatar? (url) }]
        onClick: { type: Function, optional: true },
    };
    setup() {
        this.initials = initialsOf;
        this.toneOf = toneOf;
    }
}

/** A row of status tiles: count, label, change (order status, check-ins…). */
export class OdStatusTiles extends Component {
    static template = "modern_theme.OdStatusTiles";
    static props = {
        items: Array, // [{ key, label, count, sub?, tone?, icon? }]
        onClick: { type: Function, optional: true },
    };
}

export const OD_COMPONENTS = {
    OdKpi, OdSparkline, OdComboChart, OdDonut, OdFunnel, OdRank, OdAttention, OdStack, OdFilters, OdError,
    OdGoal, OdProgressList, OdTasks, OdTable, OdFeed, OdStatusTiles,
};

/**
 * Load a dashboard safely: only the latest request counts (quick filter clicks), and a
 * server error shows an error card (first load) or a notification (refresh) instead of
 * crashing the page. `component.state` needs `loading`, `busy` and `error`.
 * Returns the data, or null when the result is stale or failed.
 */
export async function loadDashboard(component, fetch) {
    const seq = (component.__mtLoadSeq = (component.__mtLoadSeq || 0) + 1);
    const state = component.state;
    state.busy = true;
    try {
        const data = await fetch();
        if (seq !== component.__mtLoadSeq) {
            return null;
        }
        state.error = false;
        return data;
    } catch (error) {
        if (seq === component.__mtLoadSeq) {
            const message = error?.data?.message || error?.message || String(error);
            if (state.data) {
                component.env.services.notification?.add(_t("The dashboard could not be refreshed: %s", message), { type: "danger" });
            } else {
                state.error = message;
            }
        }
        return null;
    } finally {
        if (seq === component.__mtLoadSeq) {
            state.loading = false;
            state.busy = false;
        }
    }
}

/** "1 – 17 Oct 2026, compared with 1 – 17 Sep 2026" */
export function periodCaption(range, period) {
    const { DateTime } = luxon;
    const start = DateTime.fromISO(range[0]);
    const end = DateTime.fromISO(range[1]);
    const back = { month: { months: 1 }, quarter: { months: 3 }, year: { years: 1 } }[period] || { months: 1 };
    const pStart = start.minus(back);
    const pEnd = pStart.plus(end.diff(start));
    const fmt = (a, b) =>
        a.year === b.year && a.month === b.month
            ? `${a.toFormat("d")} – ${b.toFormat("d LLL yyyy")}`
            : `${a.toFormat("d LLL")} – ${b.toFormat("d LLL yyyy")}`;
    return { current: fmt(start, end), previous: fmt(pStart, pEnd) };
}

export function compareWord(period) {
    return { month: _t("vs last month"), quarter: _t("vs last quarter"), year: _t("vs last year") }[period] || "";
}
