import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { FormDrawer } from "./form_drawer";
import { OrSelectCard } from "@modern_theme/js/or_select_card";

const CRM_MODEL = "crm.lead";

const ICONS = [
    ["fa-phone", _t("Call")],
    ["fa-envelope", _t("Email")],
    ["fa-users", _t("Meeting")],
    ["fa-clock-o", _t("To-do")],
    ["fa-file-text-o", _t("Document")],
    ["fa-calendar", _t("Calendar")],
    ["fa-comments", _t("Message")],
    ["fa-star", _t("Star")],
    ["fa-check", _t("Check")],
    ["fa-tasks", _t("Tasks")],
].map(([id, title]) => ({ id, title }));

const DELAY_UNITS = [
    { id: "days", title: _t("Days") },
    { id: "weeks", title: _t("Weeks") },
    { id: "months", title: _t("Months") },
];

const PLAN_WHEN = [
    { id: "before_plan_date", title: _t("Before plan date") },
    { id: "after_plan_date", title: _t("After plan date") },
];

const ASSIGN = [
    { id: "on_demand", title: _t("Ask at launch"), hint: _t("Pick a person when the plan runs") },
    { id: "other", title: _t("Default user"), hint: _t("Always the same salesperson") },
];

const CATEGORIES = [
    { id: "default", title: _t("None"), hint: _t("A normal activity") },
    { id: "phonecall", title: _t("Phone call") },
    { id: "upload_file", title: _t("Upload a document") },
];

const TAG_COLORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function htmlToText(html) {
    if (!html) {
        return "";
    }
    const box = document.createElement("div");
    box.innerHTML = html;
    return (box.textContent || "").trim();
}

function textToHtml(text) {
    const t = (text || "").trim();
    if (!t) {
        return false;
    }
    return `<p>${t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")}</p>`;
}

function toIdList(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value) && value.length && typeof value[0] === "object") {
        return value.map((row) => row.id);
    }
    return value.map((row) => (Array.isArray(row) ? row[0] : row));
}

/** Pipeline stage — name, teams, won / fold. */
export class StageDialog extends Component {
    static template = "crm_modern.StageDialog";
    static components = { FormDrawer };
    static props = { close: Function, onSaved: { type: Function, optional: true }, resId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            teams: [],
            name: "",
            sequence: 10,
            team_ids: [],
            is_won: false,
            fold: false,
            rotting_threshold_days: 0,
            requirements: "",
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
        return _t("New stage");
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Stage") : _t("New stage");
    }
    get subtitle() {
        return this.isEdit
            ? _t("This is the column deals move through on the pipeline.")
            : _t("Name the step. Leave teams empty to use it on every pipeline.");
    }

    async load() {
        const teams = await this.orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" });
        this.state.teams = teams;
        if (!this.props.resId) {
            return;
        }
        const [st] = await this.orm.read("crm.stage", [this.props.resId], [
            "name", "sequence", "team_ids", "is_won", "fold", "rotting_threshold_days", "requirements",
        ]);
        if (!st) {
            return;
        }
        Object.assign(this.state, {
            name: st.name || "",
            sequence: st.sequence || 10,
            team_ids: toIdList(st.team_ids),
            is_won: Boolean(st.is_won),
            fold: Boolean(st.fold),
            rotting_threshold_days: st.rotting_threshold_days || 0,
            requirements: st.requirements || "",
        });
    }

    resetForm() {
        Object.assign(this.state, {
            name: "", sequence: 10, team_ids: [], is_won: false, fold: false,
            rotting_threshold_days: 0, requirements: "", error: null, saving: false, fresh: true,
        });
    }

    toggleTeam(id) {
        const ids = this.state.team_ids;
        this.state.team_ids = ids.includes(id) ? ids.filter((n) => n !== id) : [...ids, id];
    }

    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = _t("Give the stage a name.");
            return;
        }
        s.saving = true;
        const vals = {
            name: s.name.trim(),
            sequence: Number(s.sequence) || 10,
            team_ids: [[6, 0, s.team_ids]],
            is_won: s.is_won,
            fold: s.fold,
            rotting_threshold_days: Number(s.rotting_threshold_days) || 0,
            requirements: s.requirements.trim() || false,
        };
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("crm.stage", [id], vals);
            } else {
                [id] = await this.orm.create("crm.stage", [vals]);
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

/** Call / email / meeting type used on leads. */
export class ActivityTypeDialog extends Component {
    static template = "crm_modern.ActivityTypeDialog";
    static components = { FormDrawer, OrSelectCard };
    static props = { close: Function, onSaved: { type: Function, optional: true }, resId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            users: [],
            name: "",
            summary: "",
            icon: "fa-clock-o",
            delay_count: 0,
            delay_unit: "days",
            category: "default",
            default_user_id: "",
            note: "",
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
        return _t("New activity type");
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Activity type") : _t("New activity type");
    }
    get subtitle() {
        return _t("What the salesperson does — a call, a mail, a meeting.");
    }
    get iconOptions() {
        return ICONS;
    }
    get unitOptions() {
        return DELAY_UNITS;
    }
    get categoryOptions() {
        return CATEGORIES;
    }
    get userOptions() {
        return this.state.users.map((u) => ({ id: u.id, title: u.name, hint: _t("Default assignee") }));
    }

    async load() {
        this.state.users = await this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" });
        if (!this.props.resId) {
            return;
        }
        const [rec] = await this.orm.read("mail.activity.type", [this.props.resId], [
            "name", "summary", "icon", "delay_count", "delay_unit", "category", "default_user_id", "default_note",
        ]);
        if (!rec) {
            return;
        }
        Object.assign(this.state, {
            name: rec.name || "",
            summary: rec.summary || "",
            icon: rec.icon || "fa-clock-o",
            delay_count: rec.delay_count || 0,
            delay_unit: rec.delay_unit || "days",
            category: rec.category || "default",
            default_user_id: rec.default_user_id ? rec.default_user_id[0] : "",
            note: htmlToText(rec.default_note),
        });
    }

    resetForm() {
        Object.assign(this.state, {
            name: "", summary: "", icon: "fa-clock-o", delay_count: 0, delay_unit: "days",
            category: "default", default_user_id: "", note: "", error: null, saving: false, fresh: true,
        });
    }

    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = _t("Give the activity type a name.");
            return;
        }
        s.saving = true;
        const vals = {
            name: s.name.trim(),
            summary: s.summary.trim() || false,
            icon: s.icon || "fa-clock-o",
            delay_count: Number(s.delay_count) || 0,
            delay_unit: s.delay_unit || "days",
            category: s.category || "default",
            default_user_id: Number(s.default_user_id) || false,
            default_note: textToHtml(s.note),
            res_model: CRM_MODEL,
        };
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("mail.activity.type", [id], vals);
            } else {
                [id] = await this.orm.create("mail.activity.type", [vals]);
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

let stepSeq = 1;
function blankStep() {
    return {
        key: `s${stepSeq++}`,
        id: false,
        activity_type_id: "",
        summary: "",
        delay_count: 0,
        delay_unit: "days",
        delay_from: "before_plan_date",
        responsible_type: "on_demand",
        responsible_id: "",
    };
}

/** A named list of activities to launch in one click. */
export class ActivityPlanDialog extends Component {
    static template = "crm_modern.ActivityPlanDialog";
    static components = { FormDrawer, OrSelectCard };
    static props = { close: Function, onSaved: { type: Function, optional: true }, resId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            types: [],
            users: [],
            name: "",
            steps: [blankStep()],
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
        return _t("New activity plan");
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Activity plan") : _t("New activity plan");
    }
    get subtitle() {
        return _t("A short sequence — each row is one activity on the lead.");
    }
    get typeOptions() {
        return this.state.types.map((t) => ({ id: t.id, title: t.name, hint: t.summary || t.icon || "" }));
    }
    get userOptions() {
        return this.state.users.map((u) => ({ id: u.id, title: u.name }));
    }
    get unitOptions() {
        return DELAY_UNITS;
    }
    get whenOptions() {
        return PLAN_WHEN;
    }
    get assignOptions() {
        return ASSIGN;
    }

    async load() {
        const [types, users] = await Promise.all([
            this.orm.searchRead("mail.activity.type", [["res_model", "in", [false, CRM_MODEL]]], ["name", "summary", "icon"], { order: "sequence, id" }),
            this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" }),
        ]);
        this.state.types = types;
        this.state.users = users;
        if (!this.props.resId) {
            if (types[0]) {
                this.state.steps[0].activity_type_id = types[0].id;
                this.state.steps[0].summary = types[0].summary || "";
            }
            return;
        }
        const [plan] = await this.orm.read("mail.activity.plan", [this.props.resId], ["name", "template_ids"]);
        if (!plan) {
            return;
        }
        const templates = plan.template_ids?.length
            ? await this.orm.read("mail.activity.plan.template", plan.template_ids, [
                "activity_type_id", "summary", "delay_count", "delay_unit", "delay_from", "responsible_type", "responsible_id",
            ])
            : [];
        this.state.name = plan.name || "";
        this.state.steps = templates.length
            ? templates.map((row) => ({
                key: `s${stepSeq++}`,
                id: row.id,
                activity_type_id: row.activity_type_id ? row.activity_type_id[0] : "",
                summary: row.summary || "",
                delay_count: row.delay_count || 0,
                delay_unit: row.delay_unit || "days",
                delay_from: row.delay_from || "before_plan_date",
                responsible_type: row.responsible_type || "on_demand",
                responsible_id: row.responsible_id ? row.responsible_id[0] : "",
            }))
            : [blankStep()];
    }

    resetForm() {
        const first = this.state.types[0];
        const step = blankStep();
        if (first) {
            step.activity_type_id = first.id;
            step.summary = first.summary || "";
        }
        Object.assign(this.state, { name: "", steps: [step], error: null, saving: false, fresh: true });
    }

    setStep(key, field, value) {
        const step = this.state.steps.find((row) => row.key === key);
        if (!step) {
            return;
        }
        step[field] = value;
        if (field === "activity_type_id" && !step.summary) {
            const type = this.state.types.find((t) => t.id == value);
            if (type?.summary) {
                step.summary = type.summary;
            }
        }
        if (field === "responsible_type" && value === "on_demand") {
            step.responsible_id = "";
        }
    }

    addStep() {
        const step = blankStep();
        const first = this.state.types[0];
        if (first) {
            step.activity_type_id = first.id;
            step.summary = first.summary || "";
        }
        this.state.steps = [...this.state.steps, step];
    }

    removeStep(key) {
        if (this.state.steps.length === 1) {
            this.resetStep(key);
            return;
        }
        this.state.steps = this.state.steps.filter((row) => row.key !== key);
    }

    resetStep(key) {
        const idx = this.state.steps.findIndex((row) => row.key === key);
        if (idx < 0) {
            return;
        }
        const next = [...this.state.steps];
        next[idx] = blankStep();
        this.state.steps = next;
    }

    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = _t("Give the plan a name.");
            return;
        }
        const steps = s.steps.filter((row) => row.activity_type_id);
        if (!steps.length) {
            s.error = _t("Add at least one activity.");
            return;
        }
        for (const row of steps) {
            if (row.responsible_type === "other" && !row.responsible_id) {
                s.error = _t("Pick a user for steps assigned to a default person.");
                return;
            }
        }
        s.saving = true;
        const templates = steps.map((row, index) => [0, 0, {
            sequence: (index + 1) * 10,
            activity_type_id: Number(row.activity_type_id),
            summary: (row.summary || "").trim() || false,
            delay_count: Number(row.delay_count) || 0,
            delay_unit: row.delay_unit || "days",
            delay_from: row.delay_from || "before_plan_date",
            responsible_type: row.responsible_type || "on_demand",
            responsible_id: row.responsible_type === "other" ? Number(row.responsible_id) : false,
        }]);
        const vals = {
            name: s.name.trim(),
            res_model: CRM_MODEL,
            template_ids: [[5, 0, 0], ...templates],
        };
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("mail.activity.plan", [id], vals);
            } else {
                [id] = await this.orm.create("mail.activity.plan", [vals]);
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

/** A color + name label for leads. */
export class TagDialog extends Component {
    static template = "crm_modern.TagDialog";
    static components = { FormDrawer };
    static props = { close: Function, onSaved: { type: Function, optional: true }, resId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.colors = TAG_COLORS;
        this.state = useState({ name: "", color: 1, error: null, saving: false, fresh: false });
        onWillStart(() => this.load());
    }

    get isEdit() {
        return Boolean(this.props.resId) && !this.state.fresh;
    }
    get newLabel() {
        return _t("New tag");
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Tag") : _t("New tag");
    }
    get subtitle() {
        return _t("A short label you can put on leads and opportunities.");
    }

    async load() {
        if (!this.props.resId) {
            return;
        }
        const [tag] = await this.orm.read("crm.tag", [this.props.resId], ["name", "color"]);
        if (tag) {
            this.state.name = tag.name || "";
            this.state.color = tag.color || 1;
        }
    }

    resetForm() {
        Object.assign(this.state, { name: "", color: 1, error: null, saving: false, fresh: true });
    }

    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = _t("Give the tag a name.");
            return;
        }
        s.saving = true;
        const vals = { name: s.name.trim(), color: Number(s.color) || 1 };
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("crm.tag", [id], vals);
            } else {
                [id] = await this.orm.create("crm.tag", [vals]);
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

/** Internal login created from CRM, not from Odoo's Users app. */
export class UserDialog extends Component {
    static template = "crm_modern.UserDialog";
    static components = { FormDrawer, OrSelectCard };
    static props = { close: Function, onSaved: { type: Function, optional: true }, resId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            teams: [],
            name: "",
            login: "",
            password: "",
            is_salesperson: true,
            team_id: "",
            active: true,
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
        return _t("New user");
    }
    get title() {
        return this.isEdit ? this.state.name || _t("User") : _t("New user");
    }
    get subtitle() {
        return this.isEdit
            ? _t("Name, login and whether they sell. Leave the password blank to keep it.")
            : _t("Name, email and password. They can log in right away.");
    }
    get teamOptions() {
        return this.state.teams.map((t) => ({ id: t.id, title: t.name }));
    }

    async load() {
        this.state.teams = await this.orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" });
        if (!this.props.resId) {
            if (this.state.teams[0]) {
                this.state.team_id = this.state.teams[0].id;
            }
            return;
        }
        const row = await this.orm.call("res.users", "crm_modern_user_form", [this.props.resId]);
        if (!row) {
            return;
        }
        Object.assign(this.state, {
            name: row.name || "",
            login: row.login || "",
            password: "",
            is_salesperson: Boolean(row.is_salesperson),
            team_id: row.team_id || "",
            active: row.active !== false,
        });
    }

    resetForm() {
        Object.assign(this.state, {
            name: "", login: "", password: "", is_salesperson: true,
            team_id: this.state.teams[0]?.id || "", active: true, error: null, saving: false, fresh: true,
        });
    }

    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = _t("Give the person a name.");
            return;
        }
        if (!s.login.trim()) {
            s.error = _t("Give them an email to log in with.");
            return;
        }
        if (!this.isEdit && !s.password) {
            s.error = _t("Set a password so they can log in.");
            return;
        }
        s.saving = true;
        const vals = {
            name: s.name.trim(),
            login: s.login.trim(),
            password: s.password || false,
            is_salesperson: s.is_salesperson,
            team_id: s.is_salesperson ? Number(s.team_id) || false : false,
            active: s.active,
        };
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.call("res.users", "crm_modern_write_user", [id, vals]);
            } else {
                id = await this.orm.call("res.users", "crm_modern_create_user", [vals]);
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

/** A salesperson in one sales team. */
export class MemberDialog extends Component {
    static template = "crm_modern.MemberDialog";
    static components = { FormDrawer, OrSelectCard };
    static props = { close: Function, onSaved: { type: Function, optional: true }, resId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            users: [],
            teams: [],
            user_id: "",
            crm_team_id: "",
            assignment_max: 30,
            assignment_optout: false,
            active: true,
            createNew: false,
            newName: "",
            newLogin: "",
            newPassword: "",
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
        return _t("Add salesperson");
    }
    get title() {
        if (this.isEdit) {
            const user = this.state.users.find((u) => u.id == this.state.user_id);
            return user?.name || _t("Salesperson");
        }
        return _t("Add salesperson");
    }
    get subtitle() {
        return this.state.createNew
            ? _t("Create a login and put them on a team.")
            : _t("Who sells, on which team, and how many leads they can take.");
    }
    get userOptions() {
        return this.state.users.map((u) => ({ id: u.id, title: u.name }));
    }
    get teamOptions() {
        return this.state.teams.map((t) => ({ id: t.id, title: t.name }));
    }

    async load() {
        const [users, teams] = await Promise.all([
            this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" }),
            this.orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" }),
        ]);
        this.state.users = users;
        this.state.teams = teams;
        if (!this.props.resId) {
            if (teams[0]) {
                this.state.crm_team_id = teams[0].id;
            }
            return;
        }
        const [row] = await this.orm.read("crm.team.member", [this.props.resId], [
            "user_id", "crm_team_id", "assignment_max", "assignment_optout", "active",
        ]);
        if (!row) {
            return;
        }
        Object.assign(this.state, {
            user_id: row.user_id ? row.user_id[0] : "",
            crm_team_id: row.crm_team_id ? row.crm_team_id[0] : "",
            assignment_max: row.assignment_max || 0,
            assignment_optout: Boolean(row.assignment_optout),
            active: row.active !== false,
        });
    }

    resetForm() {
        Object.assign(this.state, {
            user_id: "", crm_team_id: this.state.teams[0]?.id || "", assignment_max: 30,
            assignment_optout: false, active: true, createNew: false,
            newName: "", newLogin: "", newPassword: "",
            error: null, saving: false, fresh: true,
        });
    }

    startCreate() {
        Object.assign(this.state, { createNew: true, user_id: "", error: null });
    }
    cancelCreate() {
        Object.assign(this.state, { createNew: false, newName: "", newLogin: "", newPassword: "", error: null });
    }

    async save() {
        const s = this.state;
        if (!s.crm_team_id) {
            s.error = _t("Pick a sales team.");
            return;
        }
        if (s.createNew) {
            if (!s.newName.trim()) {
                s.error = _t("Give the person a name.");
                return;
            }
            if (!s.newLogin.trim()) {
                s.error = _t("Give them an email to log in with.");
                return;
            }
            if (!s.newPassword) {
                s.error = _t("Set a password so they can log in.");
                return;
            }
        } else if (!s.user_id) {
            s.error = _t("Pick a salesperson, or create a new login.");
            return;
        }
        s.saving = true;
        try {
            let userId = Number(s.user_id) || false;
            if (s.createNew) {
                userId = await this.orm.call("res.users", "crm_modern_create_user", [{
                    name: s.newName.trim(),
                    login: s.newLogin.trim(),
                    password: s.newPassword,
                    is_salesperson: true,
                    team_id: Number(s.crm_team_id),
                }]);
            }
            const vals = {
                user_id: userId,
                crm_team_id: Number(s.crm_team_id),
                assignment_max: Number(s.assignment_max) || 0,
                assignment_optout: s.assignment_optout,
                active: s.active,
            };
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("crm.team.member", [id], vals);
            } else if (!s.createNew) {
                [id] = await this.orm.create("crm.team.member", [vals]);
            } else {
                const members = await this.orm.search("crm.team.member", [
                    ["user_id", "=", userId], ["crm_team_id", "=", Number(s.crm_team_id)],
                ], { limit: 1 });
                id = members[0] || false;
                if (id) {
                    await this.orm.write("crm.team.member", [id], {
                        assignment_max: vals.assignment_max,
                        assignment_optout: vals.assignment_optout,
                        active: vals.active,
                    });
                }
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

/** Why a deal was marked lost. */
export class LostReasonDialog extends Component {
    static template = "crm_modern.LostReasonDialog";
    static components = { FormDrawer };
    static props = { close: Function, onSaved: { type: Function, optional: true }, resId: { type: [Number, Boolean], optional: true } };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ name: "", active: true, error: null, saving: false, fresh: false });
        onWillStart(() => this.load());
    }

    get isEdit() {
        return Boolean(this.props.resId) && !this.state.fresh;
    }
    get newLabel() {
        return _t("New lost reason");
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Lost reason") : _t("New lost reason");
    }
    get subtitle() {
        return _t("A short reason salespeople pick when they mark a deal lost.");
    }

    async load() {
        if (!this.props.resId) {
            return;
        }
        const [row] = await this.orm.read("crm.lost.reason", [this.props.resId], ["name", "active"]);
        if (row) {
            this.state.name = row.name || "";
            this.state.active = row.active !== false;
        }
    }

    resetForm() {
        Object.assign(this.state, { name: "", active: true, error: null, saving: false, fresh: true });
    }

    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = _t("Give the reason a name.");
            return;
        }
        s.saving = true;
        const vals = { name: s.name.trim(), active: s.active };
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("crm.lost.reason", [id], vals);
            } else {
                [id] = await this.orm.create("crm.lost.reason", [vals]);
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}
