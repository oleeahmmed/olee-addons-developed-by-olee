import { Component } from "@odoo/owl";
import { activityTone, avatarUrl, dueInfo } from "../core/utils";

/** Page title row with optional back link and action buttons (slot "actions"). */
export class PageHeader extends Component {
    static template = "mrp_modern.PageHeader";
    static props = {
        title: String,
        description: { type: String, optional: true },
        crumb: { type: Object, optional: true, shape: { label: String, onClick: Function } },
        slots: { type: Object, optional: true },
    };
}

export class StatCard extends Component {
    static template = "mrp_modern.StatCard";
    static props = {
        label: String,
        value: String,
        hint: { type: String, optional: true },
        icon: String,
    };
}

/** Radio-group style toggle used for filters and view switches. */
export class Segmented extends Component {
    static template = "mrp_modern.Segmented";
    static props = {
        label: String,
        value: [String, Number, Boolean],
        options: Array, // [{ value, label, count? }]
        onChange: Function,
    };
}

/** Odoo priority ("0"–"3") as stars; editable when onChange is given. */
export class Stars extends Component {
    static template = "mrp_modern.Stars";
    static props = {
        value: { type: [String, Number], optional: true },
        onChange: { type: Function, optional: true },
    };
    get level() {
        return Number(this.props.value || 0);
    }
    set(n) {
        this.props.onChange(String(this.level === n ? 0 : n));
    }
}

export class TagChips extends Component {
    static template = "mrp_modern.TagChips";
    static props = {
        tags: Array, // [{ id, name, color }]
        max: { type: Number, optional: true },
        onRemove: { type: Function, optional: true },
    };
    get shown() {
        return this.props.max ? this.props.tags.slice(0, this.props.max) : this.props.tags;
    }
}

export class ActivityIcon extends Component {
    static template = "mrp_modern.ActivityIcon";
    static props = {
        type: { type: [Object, Boolean], optional: true }, // mail.activity.type values (icon, category, decoration_type)
        small: { type: Boolean, optional: true },
    };
    get tone() {
        return activityTone(this.props.type);
    }
    get icon() {
        return this.props.type?.icon || "fa-tasks";
    }
}

export class DueLabel extends Component {
    static template = "mrp_modern.DueLabel";
    static props = { date: { type: [String, Boolean], optional: true } };
    get info() {
        return dueInfo(this.props.date);
    }
}

export class Avatar extends Component {
    static template = "mrp_modern.Avatar";
    static props = {
        id: { type: [Number, Boolean], optional: true },
        name: { type: [String, Boolean], optional: true },
        size: { type: String, optional: true },
        model: { type: String, optional: true },
    };
    get src() {
        return avatarUrl(this.props.id, this.props.model);
    }
}

export class EmptyState extends Component {
    static template = "mrp_modern.EmptyState";
    static props = {
        icon: String,
        title: String,
        description: { type: String, optional: true },
        slots: { type: Object, optional: true },
    };
}

export class Progress extends Component {
    static template = "mrp_modern.Progress";
    static props = {
        value: Number,
        tone: { type: String, optional: true },
        label: { type: String, optional: true },
    };
    get pct() {
        return Math.max(0, Math.min(100, this.props.value || 0));
    }
}

export const UI = { PageHeader, StatCard, Segmented, Stars, TagChips, ActivityIcon, DueLabel, Avatar, EmptyState, Progress };
