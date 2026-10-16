import { Component, onWillStart, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { TagInput } from "./tag_input";
import { ActivityIcon } from "./ui";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

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
    static components = { Dialog, TagInput };
    static props = {
        close: Function,
        type: { type: String, validate: (t) => ["lead", "opportunity"].includes(t) },
        defaults: { type: Object, optional: true },
        onSaved: { type: Function, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        const d = this.props.defaults || {};
        this.state = useState({
            choices: { users: [], teams: [], stages: [], campaigns: [] },
            name: "", partner_name: "", contact_name: "", email_from: "", phone: "",
            expected_revenue: "", user_id: d.user_id ?? user.userId, team_id: d.team_id || "",
            campaign_id: d.campaign_id || "", stage_id: d.stage_id || "", date_deadline: "",
            priority: "1", tags: [], error: null, saving: false,
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

    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = this.isOpp ? _t("Give the opportunity a name.") : _t("Give the lead a name.");
            return;
        }
        if (s.email_from && !EMAIL_RE.test(s.email_from.trim())) {
            s.error = _t("Enter a valid email address.");
            return;
        }
        s.saving = true;
        const vals = {
            type: this.props.type,
            name: s.name.trim(),
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
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

/** New utm.campaign with its sales team (CRM Simple field) and salesperson. */
export class CampaignDialog extends Component {
    static template = "crm_modern.CampaignDialog";
    static components = { Dialog };
    static props = { close: Function, onSaved: { type: Function, optional: true } };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ choices: { users: [], teams: [] }, title: "", team_id: "", user_id: "", error: null });
        onWillStart(async () => {
            this.state.choices = await loadChoices(this.orm);
        });
    }

    async save() {
        const s = this.state;
        if (!s.title.trim()) {
            s.error = _t("Campaign name is required.");
            return;
        }
        const [id] = await this.orm.create("utm.campaign", [{
            title: s.title.trim(),
            simple_team_id: Number(s.team_id) || false,
            user_id: Number(s.user_id) || false,
        }]);
        this.props.onSaved?.(id);
        this.props.close();
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
        const a = this.props.activity;
        const kwargs = { feedback: s.feedback.trim() || false };
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
        const result = await this.orm.call("mail.activity", method, [[a.id]], kwargs);
        this.props.close();
        this.props.onDone(scheduleNext && result && typeof result === "object" ? result : false);
    }
}
