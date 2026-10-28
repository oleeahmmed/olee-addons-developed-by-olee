import { Component, onWillStart, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { TagInput } from "./tag_input";
import { ActivityIcon, TagChips } from "./ui";
import { FormDrawer } from "./form_drawer";
import { MtDateInput } from "@modern_theme/js/app_kit/date_input";
import { OrSelectCard } from "@modern_theme/js/or_select_card";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function rpcMessage(error) {
    const data = error?.data;
    const raw = data?.message || (Array.isArray(data?.arguments) && data.arguments[0]) || error?.message;
    const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    return text || _t("Could not save.");
}

/** Load the small option lists every form needs, once per dialog. */
async function loadChoices(orm, { stages = false, campaigns = false } = {}) {
    const [users, teams, stageList, campaignList] = await Promise.all([
        orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" }),
        orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" }),
        stages ? orm.searchRead("crm.stage", [], ["name", "team_ids"], { order: "sequence, id" }) : [],
        campaigns ? orm.searchRead("utm.campaign", [], ["title"], { order: "id desc" }) : [],
    ]);
    return { users, teams, stages: stageList, campaigns: campaignList };
}

/** Quick create for a lead or an opportunity (standard crm.lead fields). */
export class QuickCreateDialog extends Component {
    static template = "crm_modern.QuickCreateDialog";
    static components = { FormDrawer, TagInput, OrSelectCard, MtDateInput };
    static props = {
        close: Function,
        type: { type: String, validate: (t) => ["lead", "opportunity"].includes(t) },
        defaults: { type: Object, optional: true },
        onSaved: { type: Function, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        const d = this.props.defaults || {};
        this.state = useState({
            choices: { users: [], teams: [], stages: [], campaigns: [] },
            name: "", partner_name: "", contact_name: "", email_from: "", phone: "",
            expected_revenue: "", user_id: d.user_id ?? user.userId, team_id: d.team_id || "",
            campaign_id: d.campaign_id || "", stage_id: d.stage_id || "", date_deadline: "",
            priority: "1", tags: [], more: false, error: null, saving: false,
        });
        onWillStart(async () => {
            this.state.choices = await loadChoices(this.orm, { stages: this.isOpp, campaigns: true });
        });
    }

    get isOpp() {
        return this.props.type === "opportunity";
    }
    get title() {
        return this.isOpp ? _t("New opportunity") : _t("New lead");
    }
    get subtitle() {
        return this.isOpp
            ? _t("Add a deal to the pipeline. Open it afterwards for activities and notes.")
            : _t("Capture a prospect. Qualify it later and convert it to an opportunity.");
    }
    get teamCardOptions() {
        return this.state.choices.teams.map((t) => ({
            id: t.id,
            title: t.name,
            hint: _t("Sales team"),
        }));
    }
    get stageCardOptions() {
        return this.state.choices.stages.map((st) => ({
            id: st.id,
            title: st.name,
            hint: _t("Pipeline stage"),
        }));
    }
    get teamPlaceholder() {
        return _t("Salesperson's team");
    }
    get teamEmptyHint() {
        return _t("Uses the salesperson's default team");
    }
    get userCardOptions() {
        return this.state.choices.users.map((u) => ({
            id: u.id,
            title: u.name,
            hint: _t("Salesperson"),
        }));
    }

    resetForm() {
        const d = this.props.defaults || {};
        Object.assign(this.state, {
            name: "", partner_name: "", contact_name: "", email_from: "", phone: "",
            expected_revenue: "", user_id: d.user_id ?? user.userId, team_id: d.team_id || "",
            campaign_id: d.campaign_id || "", stage_id: d.stage_id || "", date_deadline: "",
            priority: "1", tags: [], more: false, error: null, saving: false,
        });
    }

    titleFrom() {
        const s = this.state;
        return (s.name || s.contact_name || s.partner_name || s.email_from || s.phone || "").trim();
    }

    fail(message) {
        this.state.error = message;
        this.notification.add(message, { type: "danger" });
    }

    toggleMore() {
        this.state.more = !this.state.more;
    }

    async save() {
        const s = this.state;
        const name = this.titleFrom();
        if (!name) {
            this.fail(this.isOpp
                ? _t("Enter a deal name, company, email or phone.")
                : _t("Enter a name, company, email or phone."));
            return;
        }
        if (s.email_from && !EMAIL_RE.test(s.email_from.trim())) {
            this.fail(_t("Enter a valid email address."));
            return;
        }
        s.saving = true;
        s.error = null;
        const vals = {
            type: this.props.type,
            name,
            partner_name: s.partner_name.trim() || false,
            contact_name: s.contact_name.trim() || false,
            email_from: s.email_from.trim() || false,
            phone: s.phone.trim() || false,
            expected_revenue: Number(s.expected_revenue) || 0,
            user_id: Number(s.user_id) || false,
            campaign_id: Number(s.campaign_id) || false,
            priority: s.priority,
            tag_ids: [[6, 0, s.tags.map((t) => t.id)]],
        };
        if (s.team_id) {
            vals.team_id = Number(s.team_id);
        }
        if (this.isOpp) {
            if (s.stage_id) {
                vals.stage_id = Number(s.stage_id);
            }
            vals.date_deadline = s.date_deadline || false;
        }
        try {
            const [id] = await this.orm.create("crm.lead", [vals]);
            this.notification.add(this.isOpp ? _t("Opportunity created") : _t("Lead created"), { type: "success" });
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            this.fail(rpcMessage(e));
        }
    }
}

/** Create or edit a campaign in the right-side drawer on the campaigns list. */
export class CampaignDialog extends Component {
    static template = "crm_modern.CampaignDialog";
    static components = { FormDrawer, TagChips, OrSelectCard };
    static props = {
        close: Function,
        onSaved: { type: Function, optional: true },
        resId: { type: [Number, Boolean], optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.state = useState({
            choices: { users: [], teams: [], stages: [], tags: [] },
            title: "",
            team_id: "",
            user_id: "",
            stage_id: "",
            tags: [],
            useLeads: false,
            error: null,
            saving: false,
            fresh: false,
        });
        onWillStart(() => this.load());
    }

    get isEdit() {
        return Boolean(this.props.resId) && !this.state.fresh;
    }
    get newLabel() {
        return _t("New campaign");
    }
    get title() {
        if (!this.isEdit) {
            return _t("New campaign");
        }
        const name = (this.state.title || "").trim();
        return name || _t("Campaign");
    }
    get subtitle() {
        return this.isEdit
            ? _t("Changes save when you click Save. Leads and opportunities stay on their own pages.")
            : _t("Name it and pick a team. Upload contacts from the campaign card afterwards.");
    }
    get availableTags() {
        const taken = new Set(this.state.tags.map((t) => t.id));
        return this.state.choices.tags.filter((t) => !taken.has(t.id));
    }
    get teamCardOptions() {
        return this.state.choices.teams.map((t) => ({
            id: t.id,
            title: t.name,
            hint: _t("Sales team"),
        }));
    }
    get stageCardOptions() {
        return this.state.choices.stages.map((st) => ({
            id: st.id,
            title: st.name,
            hint: _t("Campaign stage"),
            badge: st.id === this.state.choices.stages[0]?.id ? _t("Default") : "",
        }));
    }
    get userCardOptions() {
        return this.state.choices.users.map((u) => ({
            id: u.id,
            title: u.name,
            hint: _t("Salesperson"),
        }));
    }

    resetForm() {
        const stages = this.state.choices.stages;
        Object.assign(this.state, {
            title: "",
            team_id: "",
            user_id: "",
            stage_id: stages[0] ? String(stages[0].id) : "",
            tags: [],
            error: null,
            saving: false,
            fresh: true,
        });
    }

    async load() {
        if (this.props.resId) {
            const data = await this.orm.call("utm.campaign", "crm_modern_campaign_detail", [this.props.resId]);
            const c = data.campaign;
            Object.assign(this.state, {
                choices: { users: data.users, teams: data.teams, stages: data.stages, tags: data.tags },
                title: c.title || "",
                team_id: c.team_id ? String(c.team_id[0]) : "",
                user_id: c.user_id ? String(c.user_id[0]) : "",
                stage_id: c.stage_id ? String(c.stage_id[0]) : "",
                tags: c.tag_ids || [],
                useLeads: Boolean(data.use_leads),
            });
            return;
        }
        const [choices, stages, tags] = await Promise.all([
            loadChoices(this.orm),
            this.orm.searchRead("utm.stage", [], ["name"], { order: "sequence, id" }),
            this.orm.searchRead("utm.tag", [], ["name", "color"], { order: "name" }),
        ]);
        this.state.choices = { ...choices, stages, tags };
        if (stages[0]) {
            this.state.stage_id = String(stages[0].id);
        }
    }

    addTag(ev) {
        const id = Number(ev.target.value);
        ev.target.value = "";
        const tag = this.state.choices.tags.find((t) => t.id === id);
        if (tag) {
            this.state.tags = [...this.state.tags, tag];
        }
    }

    removeTag(id) {
        this.state.tags = this.state.tags.filter((t) => t.id !== id);
    }

    async openLeads() {
        const action = await this.orm.call("utm.campaign", "crm_modern_open_leads", [this.props.resId]);
        this.props.close();
        return this.action.doAction(action);
    }

    async openPipeline() {
        const action = await this.orm.call("utm.campaign", "crm_modern_open_pipeline", [this.props.resId]);
        this.props.close();
        return this.action.doAction(action);
    }

    async save() {
        const s = this.state;
        if (!s.title.trim()) {
            s.error = _t("Campaign name is required.");
            this.notification.add(s.error, { type: "danger" });
            return;
        }
        s.saving = true;
        const vals = { title: s.title.trim() };
        if (s.user_id) {
            vals.user_id = Number(s.user_id);
        }
        vals.crm_modern_team_id = Number(s.team_id) || false;
        if (s.stage_id) {
            vals.stage_id = Number(s.stage_id);
        }
        vals.tag_ids = [[6, 0, s.tags.map((t) => t.id)]];
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("utm.campaign", [id], vals);
            } else {
                [id] = await this.orm.create("utm.campaign", [vals]);
            }
            this.props.onSaved?.(id);
            this.notification.add(_t("Saved"), { type: "success" });
            this.props.close();
        } catch (e) {
            s.saving = false;
            s.error = rpcMessage(e);
            this.notification.add(s.error, { type: "danger" });
        }
    }
}

/**
 * Mark an activity done with feedback (mail.activity.action_feedback).
 * "Done & schedule next" uses Odoo's own action_feedback_schedule_next, so the
 * activity type's suggested / triggered next activities apply exactly as in Odoo.
 */
export class MarkDoneDialog extends Component {
    static template = "crm_modern.MarkDoneDialog";
    static components = { Dialog, ActivityIcon };
    static props = {
        close: Function,
        activity: Object, // { id, summary, note, res_id, res_model, activity_type_id }
        type: { type: [Object, Boolean], optional: true }, // mail.activity.type values
        onDone: Function, // receives the follow-up action (or false)
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ feedback: "", file: null, error: null, busy: false });
    }

    get needsFile() {
        return this.props.type?.category === "upload_file";
    }

    onFile(ev) {
        this.state.file = ev.target.files?.[0] || null;
    }

    async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async done(scheduleNext) {
        const s = this.state;
        if (this.needsFile && !s.file) {
            s.error = _t("Attach the document to complete this activity.");
            return;
        }
        s.busy = true;
        s.error = "";
        const a = this.props.activity;
        const kwargs = { feedback: s.feedback.trim() || false };
        let result;
        try {
            if (s.file) {
                const [attId] = await this.orm.create("ir.attachment", [{
                    name: s.file.name,
                    datas: await this.readFile(s.file),
                    res_model: a.res_model,
                    res_id: a.res_id,
                }]);
                kwargs.attachment_ids = [attId];
            }
            const method = scheduleNext ? "action_feedback_schedule_next" : "action_feedback";
            result = await this.orm.call("mail.activity", method, [[a.id]], kwargs);
        } catch (error) {
            // Keep the dialog usable after a server error (buttons used to stay disabled).
            s.busy = false;
            throw error;
        }
        this.props.close();
        this.props.onDone(scheduleNext && result && typeof result === "object" ? result : false);
    }
}
