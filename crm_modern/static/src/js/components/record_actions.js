import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadFeatures } from "../core/features";
import { openInDialog } from "../core/utils";
import { MtDateInput } from "@modern_theme/js/app_kit/date_input";

/**
 * Extra tabs other addons add to the record page's action card, e.g. "Quotation"
 * when Sales is installed: { label, icon, Component, sequence, isVisible(record, features) }.
 * The component receives props { record, reload }.
 */
export const recordTabs = registry.category("crm_modern.record_tabs");

const { DateTime } = luxon;

/**
 * Compact action card of the opportunity / lead page: send a message, log a note,
 * schedule an activity — and whatever other addons register (quotations...) —
 * in one small tabbed box instead of separate tall sections.
 */
export class RecordActions extends Component {
    static template = "crm_modern.RecordActions";
    static components = { MtDateInput };
    static props = {
        record: Object,
        users: Array,
        reload: Function, // reloads the record, its activities and the chatter
        onAdvancedSchedule: Function, // Odoo's full scheduler (activity plans)
    };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.state = useState({
            tab: "message",
            body: "",
            busy: false,
            types: [],
            features: {},
            act: { typeId: false, summary: "", when: "auto", date: "", userId: false, note: "" },
        });
        onWillStart(async () => {
            const [types, features] = await Promise.all([
                this.orm.searchRead(
                    "mail.activity.type",
                    ["|", ["res_model", "=", false], ["res_model", "=", "crm.lead"]],
                    ["name", "icon", "delay_count", "delay_unit", "summary"],
                    { order: "sequence, id" }
                ),
                loadFeatures(this.orm),
            ]);
            this.state.types = types;
            this.state.features = features;
            this.resetActivity();
        });
    }

    // ---------- tabs ----------
    get tabs() {
        const tabs = [
            { key: "message", label: _t("Send message"), icon: "fa-paper-plane-o" },
            { key: "note", label: _t("Log note"), icon: "fa-sticky-note-o" },
            { key: "activity", label: _t("Activity"), icon: "fa-calendar-plus-o" },
        ];
        const extra = recordTabs
            .getEntries()
            .filter(([, tab]) => !tab.isVisible || tab.isVisible(this.props.record, this.state.features))
            .map(([key, tab]) => ({ key, label: tab.label, icon: tab.icon, Component: tab.Component, sequence: tab.sequence || 50 }))
            .sort((a, b) => a.sequence - b.sequence);
        return [...tabs, ...extra];
    }
    get extraTab() {
        return this.tabs.find((t) => t.key === this.state.tab && t.Component);
    }
    setTab(key) {
        this.state.tab = key;
    }

    // ---------- message / note ----------
    get isMessage() {
        return this.state.tab === "message";
    }
    onBodyKeydown(ev) {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            this.post();
        }
    }
    async post() {
        const body = this.state.body.trim();
        if (!body || this.state.busy) {
            return;
        }
        this.state.busy = true;
        try {
            await this.orm.call("crm.lead", "crm_modern_post", [[this.props.record.id], body, this.isMessage ? "message" : "note"]);
            this.state.body = "";
            this.notification.add(this.isMessage ? _t("Message sent") : _t("Note logged"), { type: "success" });
            await this.props.reload();
        } finally {
            this.state.busy = false;
        }
    }
    /** Odoo's full composer: recipients, templates, attachments. */
    fullComposer() {
        const isMessage = this.isMessage;
        return openInDialog(this.action, {
            type: "ir.actions.act_window",
            name: isMessage ? _t("Compose email") : _t("Log note"),
            res_model: "mail.compose.message",
            views: [[false, "form"]],
            target: "new",
            context: {
                default_model: "crm.lead",
                default_res_ids: [this.props.record.id],
                default_composition_mode: "comment",
                default_subtype_xmlid: isMessage ? "mail.mt_comment" : "mail.mt_note",
                default_body: this.state.body ? this.state.body.replace(/\n/g, "<br/>") : "",
                mail_post_autofollow: true,
            },
        }).then(() => {
            this.state.body = "";
            return this.props.reload();
        });
    }

    // ---------- quick activity ----------
    get activityType() {
        return this.state.types.find((t) => t.id === this.state.act.typeId);
    }
    resetActivity() {
        const first = this.state.types[0];
        Object.assign(this.state.act, {
            typeId: first ? first.id : false,
            summary: "",
            when: "auto",
            date: "",
            note: "",
            userId: this.props.record.user_id ? this.props.record.user_id[0] : false,
        });
    }
    pickType(type) {
        this.state.act.typeId = type.id;
    }
    get autoLabel() {
        const t = this.activityType;
        if (!t || !t.delay_count) {
            return _t("Today");
        }
        const units = { days: _t("days"), weeks: _t("weeks"), months: _t("months") };
        return _t("In %(count)s %(unit)s", { count: t.delay_count, unit: units[t.delay_unit] || t.delay_unit });
    }
    get whenOptions() {
        return [
            { key: "auto", label: this.autoLabel },
            { key: "today", label: _t("Today") },
            { key: "tomorrow", label: _t("Tomorrow") },
            { key: "week", label: _t("Next week") },
        ].filter((o, i, all) => i === 0 || o.label !== all[0].label);
    }
    pickWhen(key) {
        Object.assign(this.state.act, { when: key, date: "" });
    }
    onDate(value) {
        Object.assign(this.state.act, { date: value, when: value ? "date" : "auto" });
    }
    get deadline() {
        const today = DateTime.local().startOf("day");
        const map = { today: today, tomorrow: today.plus({ days: 1 }), week: today.plus({ weeks: 1 }).startOf("week") };
        if (this.state.act.when === "date") {
            return this.state.act.date || false;
        }
        return map[this.state.act.when] ? map[this.state.act.when].toISODate() : false; // auto: the type's own delay
    }
    onUser(ev) {
        this.state.act.userId = Number(ev.target.value) || false;
    }
    async schedule() {
        const act = this.state.act;
        if (!act.typeId || this.state.busy) {
            return;
        }
        this.state.busy = true;
        try {
            await this.orm.call("crm.lead", "crm_modern_schedule", [[this.props.record.id], act.typeId], {
                date_deadline: this.deadline,
                summary: act.summary.trim(),
                user_id: act.userId,
                note: act.note.trim(),
            });
            this.notification.add(_t("Activity scheduled"), { type: "success" });
            this.resetActivity();
            await this.props.reload();
        } finally {
            this.state.busy = false;
        }
    }
}
