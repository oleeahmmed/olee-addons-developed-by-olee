import { _t } from "@web/core/l10n/translation";
import { formatCurrency } from "@web/core/currency";
import { deserializeDate, deserializeDateTime, formatDate, formatDateTime } from "@web/core/l10n/dates";

/** Full money string in the given currency, e.g. "$ 12,500.00". */
export function money(amount, currencyId) {
    return formatCurrency(amount || 0, currencyId, { digits: [69, 0] });
}

/** Short money string for KPIs and column totals, e.g. "$ 12.5k". */
export function moneyShort(amount, currencyId) {
    return formatCurrency(amount || 0, currencyId, { humanReadable: true, digits: [69, 1] });
}

export function compact(n) {
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}

export function avatarUrl(userId, model = "res.users") {
    return userId ? `/web/image/${model}/${userId}/avatar_128` : "/web/static/img/placeholder.png";
}

export function toDate(value) {
    if (!value) {
        return null;
    }
    return value.length > 10 ? deserializeDateTime(value) : deserializeDate(value);
}

export function shortDate(value) {
    const d = toDate(value);
    return d ? formatDate(d) : "";
}

export function shortDateTime(value) {
    const d = toDate(value);
    return d ? formatDateTime(d) : "";
}

/** Overdue / today / planned, with a human label, for a date string "YYYY-MM-DD". */
export function dueInfo(value) {
    if (!value) {
        return { state: "planned", label: "" };
    }
    const today = luxon.DateTime.local().startOf("day");
    const day = deserializeDate(value.slice(0, 10)).startOf("day");
    const diff = Math.round(day.diff(today, "days").days);
    if (diff === 0) {
        return { state: "today", label: _t("Today") };
    }
    if (diff === 1) {
        return { state: "planned", label: _t("Tomorrow") };
    }
    if (diff === -1) {
        return { state: "overdue", label: _t("Yesterday") };
    }
    return diff < 0
        ? { state: "overdue", label: _t("%s days overdue", -diff) }
        : { state: "planned", label: _t("In %s days", diff) };
}

/** Tone class for an activity type, from its category or decoration (mail.activity.type). */
export function activityTone(type) {
    if (!type) {
        return "";
    }
    if (type.decoration_type === "danger" || type.decoration_type === "warning") {
        return `im-tone-${type.decoration_type}`;
    }
    return type.category ? `im-tone-${type.category}` : "";
}

export function greeting() {
    const h = new Date().getHours();
    return h < 12 ? _t("Good morning") : h < 18 ? _t("Good afternoon") : _t("Good evening");
}

/** Run an Odoo window action in a dialog and resolve once it closes. */
export function openInDialog(actionService, action) {
    return new Promise((resolve) => actionService.doAction(action, { onClose: resolve }));
}
