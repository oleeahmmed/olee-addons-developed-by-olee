/** @odoo-module **/
// Activity scheduling in the chatter opens inline, never as a dialog: clicking
// "Activity" toggles a small panel under the chatter tabs (type chips, summary,
// assignee, due date chips, a note) — the same quick-schedule pattern as the CRM app,
// on every form of every app. The panel is styled in chatter.scss (.mt-act).
import { useEffect, useRef } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { Chatter } from "@mail/chatter/web_portal/chatter";
// the dialog-based chatter patch must be applied before ours, whatever the bundle order
import "@mail/chatter/web/chatter_patch";

const { DateTime } = luxon;

patch(Chatter.prototype, {
    setup() {
        super.setup(...arguments);
        this.mtOrm = useService("orm");
        this.mtNotify = useService("notification");
        Object.assign(this.state, {
            mtAct: {
                open: false,
                loaded: false,
                busy: false,
                types: [],
                users: [],
                typeId: false,
                userId: false,
                summary: "",
                when: "auto",
                date: "",
                note: "",
            },
        });
        this.mtActInputRef = useRef("mtActInput");
        useEffect(
            () => {
                if (this.state.mtAct.open) {
                    this.mtActInputRef.el?.focus();
                }
            },
            () => [this.state.mtAct.open]
        );
    },

    get mtActType() {
        return this.state.mtAct.types.find((type) => type.id === this.state.mtAct.typeId);
    },
    get mtActWhenOptions() {
        const type = this.mtActType;
        const units = { days: _t("days"), weeks: _t("weeks"), months: _t("months") };
        const auto = type?.delay_count
            ? _t("In %(count)s %(unit)s", { count: type.delay_count, unit: units[type.delay_unit] || type.delay_unit })
            : _t("Today");
        return [
            { key: "auto", label: auto },
            { key: "today", label: _t("Today") },
            { key: "tomorrow", label: _t("Tomorrow") },
            { key: "week", label: _t("Next week") },
        ].filter((option, index, all) => index === 0 || option.label !== all[0].label);
    },

    async mtToggleActivity() {
        const act = this.state.mtAct;
        this.closeSearch();
        if (act.open) {
            act.open = false;
            return;
        }
        if (!this.state.thread?.id) {
            this.onThreadCreated = () => this.mtToggleActivity();
            await this.props.saveRecord?.();
            return;
        }
        if (this.state.composerType) {
            this.state.composerType = false;
        }
        act.open = true;
        await this.mtLoadActivityData();
    },

    mtCloseActivity() {
        this.state.mtAct.open = false;
    },

    async mtLoadActivityData() {
        const act = this.state.mtAct;
        if (act.loaded) {
            return;
        }
        const model = this.state.thread.model;
        const [types, users] = await Promise.all([
            this.mtOrm.searchRead(
                "mail.activity.type",
                ["|", ["res_model", "=", false], ["res_model", "=", model]],
                ["name", "icon", "summary", "delay_count", "delay_unit"],
                { order: "sequence, id" }
            ),
            this.mtOrm.searchRead(
                "res.users",
                [["share", "=", false], ["active", "=", true]],
                ["name"],
                { order: "name" }
            ),
        ]);
        act.types = types;
        act.users = users;
        act.userId = this.env.services.user?.userId || users[0]?.id || false;
        if (!act.typeId) {
            act.typeId = types[0]?.id || false;
        }
        act.loaded = true;
    },

    mtPickActType(type) {
        this.state.mtAct.typeId = type.id;
    },
    mtPickActWhen(key) {
        Object.assign(this.state.mtAct, { when: key, date: "" });
    },
    mtPickActDate(ev) {
        const date = ev.target.value || "";
        Object.assign(this.state.mtAct, { date, when: date ? "date" : "auto" });
    },
    mtPickActUser(ev) {
        this.state.mtAct.userId = Number(ev.target.value) || false;
    },
    mtActDeadline() {
        const act = this.state.mtAct;
        const today = DateTime.now().startOf("day");
        const fixed = {
            today,
            tomorrow: today.plus({ days: 1 }),
            week: today.plus({ weeks: 1 }).startOf("week"),
        };
        if (act.when === "date") {
            return act.date || false;
        }
        if (fixed[act.when]) {
            return fixed[act.when].toISODate();
        }
        const type = this.mtActType;
        const units = { days: "days", weeks: "weeks", months: "months" };
        if (type?.delay_count && units[type.delay_unit]) {
            return today.plus({ [units[type.delay_unit]]: type.delay_count }).toISODate();
        }
        return today.toISODate();
    },

    async mtScheduleActivity() {
        const act = this.state.mtAct;
        const thread = this.state.thread;
        if (!act.typeId || act.busy || !thread?.id) {
            return;
        }
        act.busy = true;
        try {
            const values = {
                activity_type_id: act.typeId,
                automated: false,
                summary: act.summary.trim(),
                note: act.note.trim().replace(/\n/g, "<br/>"),
                date_deadline: this.mtActDeadline(),
            };
            if (act.userId) {
                values.user_id = act.userId;
            }
            await this.mtOrm.call(thread.model, "activity_schedule", [[thread.id]], values);
            this.mtNotify.add(_t("Activity scheduled"), { type: "success" });
            Object.assign(act, { open: false, summary: "", note: "", when: "auto", date: "" });
            this.load(thread, ["activities", "messages"]);
            if (this.props.hasParentReloadOnActivityChanged) {
                await this.reloadParentView();
            }
        } finally {
            act.busy = false;
        }
    },

    // escape hatch: Odoo's full scheduler (activity plans, custom details)
    mtOpenFullScheduler() {
        this.state.mtAct.open = false;
        return super.scheduleActivity(...arguments);
    },

    // the chatter Activity button (base template) now toggles the inline panel
    async scheduleActivity() {
        if (this.env.config && this.state.thread?.model) {
            await this.mtToggleActivity();
            return;
        }
        return super.scheduleActivity(...arguments);
    },
    toggleComposer(mode = false, options = {}) {
        if (mode) {
            this.state.mtAct.open = false;
        }
        return super.toggleComposer(mode, options);
    },
});
