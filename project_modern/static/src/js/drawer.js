import { Component, onWillDestroy, onWillStart, onWillUnmount, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { serializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OrSelectCard } from "@modern_theme/js/or_select_card";

/**
 * The right-side drawer of Modern CRM (same component, same theme classes .o_or_sheet /
 * .or-*), for the simple records of the Project app: a new task, a new project, a task
 * stage, a tag. Big records (an existing task with its subtasks, timesheets and chatter,
 * project settings…) open as Odoo's own full page.
 * Values are read and written with the ORM, under the user's own access rights.
 */
export class FormDrawer extends Component {
    static template = "project_modern.FormDrawer";
    static components = { Dialog };
    static props = {
        title: String,
        subtitle: { type: String, optional: true },
        close: Function,
        onNew: { type: Function, optional: true },
        newLabel: { type: String, optional: true },
        slots: { type: Object, optional: true },
    };

    setup() {
        document.body.classList.add("or-sheet-open");
        onWillDestroy(() => document.body.classList.remove("or-sheet-open"));
    }
    get newLabel() {
        return this.props.newLabel || _t("New record");
    }
    onNew(ev) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        if (this.props.onNew) {
            this.props.onNew();
            return;
        }
        this.props.close();
    }
    close(ev) {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        this.props.close();
    }
}

/** Search-as-you-type picker (name_search, so it finds what Odoo's many2one finds). */
export class PmPicker extends Component {
    static template = "project_modern.Picker";
    static props = {
        resModel: String,
        domain: { type: Array, optional: true },
        placeholder: { type: String, optional: true },
        value: { type: [Array, Boolean], optional: true }, // [id, name]
        onSelect: Function, // ([id, name] | false) => void
        allowEmpty: { type: Boolean, optional: true },
        id: { type: String, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ q: "", editing: false, open: false, results: [], active: 0, loading: false });
        this.timer = null;
        onWillUnmount(() => clearTimeout(this.timer));
    }
    get label() {
        return this.props.value ? this.props.value[1] : "";
    }
    onFocus() {
        Object.assign(this.state, { editing: true, q: "", open: true });
        this.search();
    }
    onBlur() {
        setTimeout(() => Object.assign(this.state, { open: false, editing: false }), 150);
    }
    onInput(ev) {
        this.state.q = ev.target.value;
        this.state.open = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.search(), 200);
    }
    async search() {
        this.state.loading = true;
        const results = await this.orm.call(this.props.resModel, "name_search", [], {
            name: this.state.q,
            domain: this.props.domain || [],
            limit: 8,
        });
        Object.assign(this.state, { results, active: 0, loading: false });
    }
    noop() {}
    pick(result) {
        this.props.onSelect(result);
        Object.assign(this.state, { q: "", open: false, editing: false });
        document.activeElement?.blur?.();
    }
    clear(ev) {
        ev.stopPropagation();
        this.props.onSelect(false);
    }
    onKeydown(ev) {
        const n = this.state.results.length;
        if (ev.key === "ArrowDown" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active + 1) % n;
        } else if (ev.key === "ArrowUp" && n) {
            ev.preventDefault();
            this.state.active = (this.state.active - 1 + n) % n;
        } else if (ev.key === "Enter" && this.state.open && n) {
            ev.preventDefault();
            this.pick(this.state.results[this.state.active]);
        } else if (ev.key === "Escape") {
            this.state.open = false;
        }
    }
}

/** Open a drawer component; resolves when it closes. */
export function openQuickDrawer(dialogService, DrawerComponent, props = {}) {
    return new Promise((resolve) => dialogService.add(DrawerComponent, props, { onClose: resolve }));
}

const toIds = (v) => (v || []).map((x) => (Array.isArray(x) ? x[0] : typeof x === "object" ? x.id : x));

/** Shared part of the drawers: load / new / save / open the full form. */
export class QuickDrawer extends Component {
    static components = { FormDrawer, OrSelectCard, PmPicker };
    static props = {
        close: Function,
        onSaved: { type: Function, optional: true },
        resId: { type: [Number, Boolean], optional: true },
        context: { type: Object, optional: true },
    };
    static resModel = "";
    /** fields with their empty value (many2one: false or [id, name], many2many: []) */
    static defaults = {};

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ ...this.emptyValues(), error: null, saving: false, fresh: false, choices: {} });
        onWillStart(() => this.load());
    }
    emptyValues() {
        const values = JSON.parse(JSON.stringify(this.constructor.defaults));
        for (const [key, value] of Object.entries(this.props.context || {})) {
            const name = key.startsWith("default_") ? key.slice(8) : null;
            if (name && name in values && !Array.isArray(value)) {
                values[name] = value;
            }
        }
        return values;
    }
    get isEdit() {
        return Boolean(this.props.resId) && !this.state.fresh;
    }
    get fieldNames() {
        return Object.keys(this.constructor.defaults);
    }
    async loadChoices() {}
    async load() {
        await this.loadChoices();
        if (!this.props.resId) {
            return;
        }
        const [rec] = await this.orm.read(this.constructor.resModel, [this.props.resId], this.fieldNames);
        if (rec) {
            const values = {};
            for (const name of this.fieldNames) {
                const empty = this.constructor.defaults[name];
                const v = rec[name];
                values[name] = Array.isArray(empty) ? toIds(v) : v === false && empty !== false ? empty : v;
            }
            Object.assign(this.state, values);
        }
    }
    toValues() {
        const vals = {};
        for (const name of this.fieldNames) {
            const empty = this.constructor.defaults[name];
            let v = this.state[name];
            if (Array.isArray(empty)) {
                v = [[6, 0, v]];
            } else if (Array.isArray(v)) {
                v = v[0];
            } else if (v === "" || v === null || v === undefined) {
                v = false;
            }
            vals[name] = v;
        }
        return vals;
    }
    validate() {
        return null;
    }
    resetForm() {
        Object.assign(this.state, this.emptyValues(), { error: null, saving: false, fresh: true });
    }
    toggle(name, id) {
        const ids = this.state[name];
        this.state[name] = ids.includes(id) ? ids.filter((n) => n !== id) : [...ids, id];
    }
    async save() {
        const error = this.validate();
        if (error) {
            this.state.error = error;
            return;
        }
        Object.assign(this.state, { error: null, saving: true });
        const model = this.constructor.resModel;
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write(model, [id], this.toValues());
            } else {
                [id] = await this.orm.create(model, [this.toValues()], { context: this.props.context || {} });
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            this.state.saving = false;
            throw e;
        }
    }
    /** Odoo's own form as a full page, with what was typed so far as default values. */
    openFullForm() {
        const resId = this.isEdit ? this.props.resId : false;
        const context = { ...(this.props.context || {}) };
        if (!resId) {
            for (const [name, value] of Object.entries(this.toValues())) {
                if (value !== false && !(Array.isArray(value) && !value[0][2].length)) {
                    context[`default_${name}`] = value;
                }
            }
        }
        this.props.close();
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: this.constructor.resModel,
            res_id: resId || undefined,
            views: [[false, "form"]],
            target: "current",
            context,
        });
    }
}

const COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const PRIORITIES = [
    { id: "0", label: _t("Low") },
    { id: "1", label: _t("Medium") },
    { id: "2", label: _t("High") },
    { id: "3", label: _t("Urgent") },
];

/** New task: title, project, assignees, deadline, priority, tags (all the rest: full form). */
export class TaskDrawer extends QuickDrawer {
    static template = "project_modern.TaskDrawer";
    static resModel = "project.task";
    static defaults = {
        name: "", project_id: false, parent_id: false, user_ids: [], date_deadline: "", priority: "0", tag_ids: [],
    };

    emptyValues() {
        // assigned to me by default, as Odoo's own quick create does
        return { ...super.emptyValues(), user_ids: [user.userId] };
    }
    get title() {
        return this.state.parent_id ? _t("New sub-task") : _t("New task");
    }
    get subtitle() {
        return _t("What needs doing, in which project, by whom and when. Sub-tasks, time and notes are on the task's page.");
    }
    get priorities() {
        return PRIORITIES;
    }
    get users() {
        return this.state.choices.users || [];
    }
    get tags() {
        return this.state.choices.tags || [];
    }
    get projectValue() {
        const id = Array.isArray(this.state.project_id) ? this.state.project_id[0] : this.state.project_id;
        if (!id) {
            return false;
        }
        const name = this.state.choices.projectName || (Array.isArray(this.state.project_id) ? this.state.project_id[1] : "");
        return [id, name];
    }
    async loadChoices() {
        const ctx = this.props.context || {};
        const [users, tags, projects] = await Promise.all([
            this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name", limit: 80 }),
            this.orm.searchRead("project.tags", [], ["name", "color"], { order: "name", limit: 60 }),
            ctx.default_project_id
                ? this.orm.read("project.project", [ctx.default_project_id], ["display_name"]).catch(() => [])
                : [],
        ]);
        this.state.choices = { users, tags, projectName: projects[0]?.display_name || "" };
    }
    setProject(value) {
        this.state.project_id = value || false;
        this.state.choices.projectName = value ? value[1] : "";
    }
    validate() {
        if (!this.state.name.trim()) {
            return _t("Give the task a title.");
        }
        return null;
    }
    toValues() {
        const vals = super.toValues();
        vals.name = this.state.name.trim();
        vals.date_deadline = this.state.date_deadline
            ? serializeDateTime(luxon.DateTime.fromISO(this.state.date_deadline).endOf("day").set({ millisecond: 0 }))
            : false;
        return vals;
    }
}

/** New project: name, customer, manager, dates, tags, visibility. */
export class ProjectDrawer extends QuickDrawer {
    static template = "project_modern.ProjectDrawer";
    static resModel = "project.project";
    static defaults = {
        name: "", partner_id: false, user_id: false, date_start: "", date: "", tag_ids: [], privacy_visibility: "",
        label_tasks: "",
    };

    emptyValues() {
        return { ...super.emptyValues(), user_id: [user.userId, user.name] };
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Project") : _t("New project");
    }
    get subtitle() {
        return _t("Name it and choose who leads it. Stages, sharing and the rest are in the project's settings.");
    }
    get tags() {
        return this.state.choices.tags || [];
    }
    get privacyOptions() {
        return this.state.choices.privacy || [];
    }
    async loadChoices() {
        const [tags, fields, defaults] = await Promise.all([
            this.orm.searchRead("project.tags", [], ["name", "color"], { order: "name", limit: 60 }),
            this.orm.call("project.project", "fields_get", [["privacy_visibility"]], { attributes: ["selection"] }),
            this.orm.call("project.project", "default_get", [["privacy_visibility"]]).catch(() => ({})),
        ]);
        const privacy = (fields.privacy_visibility?.selection || []).map(([id, label]) => ({ id, label }));
        this.state.choices = { tags, privacy };
        if (!this.state.privacy_visibility) {
            this.state.privacy_visibility = defaults.privacy_visibility || "";
        }
    }
    validate() {
        if (!this.state.name.trim()) {
            return _t("Give the project a name.");
        }
        if (this.state.date_start && this.state.date && this.state.date < this.state.date_start) {
            return _t("The end date must be after the start date.");
        }
        return null;
    }
    toValues() {
        const vals = super.toValues();
        vals.name = this.state.name.trim();
        if (!vals.label_tasks) {
            delete vals.label_tasks;
        }
        if (!vals.privacy_visibility) {
            delete vals.privacy_visibility;
        }
        return vals;
    }
}

/** Task stage: name, projects using it, folded. */
export class StageDrawer extends QuickDrawer {
    static template = "project_modern.StageDrawer";
    static resModel = "project.task.type";
    static defaults = { name: "", project_ids: [], fold: false, sequence: 10 };

    get title() {
        return this.isEdit ? this.state.name || _t("Stage") : _t("New stage");
    }
    get subtitle() {
        return _t("A column of the task boards. Pick the projects that use it.");
    }
    get projects() {
        return this.state.choices.projects || [];
    }
    async loadChoices() {
        const projects = await this.orm.searchRead("project.project", [["is_template", "=", false]], ["name"], {
            order: "name",
            limit: 80,
        });
        this.state.choices = { projects };
    }
    validate() {
        return this.state.name.trim() ? null : _t("Give the stage a name.");
    }
    toValues() {
        return { ...super.toValues(), name: this.state.name.trim(), sequence: Number(this.state.sequence) || 10 };
    }
}

/** Tag: name and colour. */
export class TagDrawer extends QuickDrawer {
    static template = "project_modern.TagDrawer";
    static resModel = "project.tags";
    static defaults = { name: "", color: 0 };

    get colors() {
        return COLORS;
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Tag") : _t("New tag");
    }
    get subtitle() {
        return _t("Labels to sort and filter tasks and projects.");
    }
    validate() {
        return this.state.name.trim() ? null : _t("Give the tag a name.");
    }
    toValues() {
        return { name: this.state.name.trim(), color: this.state.color || 0 };
    }
}
