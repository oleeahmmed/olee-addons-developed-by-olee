import { Component, onWillDestroy, onWillStart, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { OrSelectCard } from "@modern_theme/js/or_select_card";

/**
 * The right-side drawer of Modern CRM, used only for the simple records of the HR apps
 * (department, job position, attendance). Same component and the theme's same classes
 * (.o_or_sheet, .or-*), so it looks exactly like CRM's. Big records (employee, time off,
 * allocation…) keep opening as Odoo's own full page with every feature.
 * Values are read and written with the ORM, under the user's own access rights.
 */
export class FormDrawer extends Component {
    static template = "employee_modern.FormDrawer";
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

/** Open a drawer component; resolves when it closes. */
export function openQuickDrawer(dialogService, DrawerComponent, props = {}) {
    return new Promise((resolve) => dialogService.add(DrawerComponent, props, { onClose: resolve }));
}

/** Shared part of the HR drawers: load / new / save / open the full form. */
export class QuickDrawer extends Component {
    static components = { FormDrawer, OrSelectCard };
    static props = {
        close: Function,
        onSaved: { type: Function, optional: true },
        resId: { type: [Number, Boolean], optional: true },
        context: { type: Object, optional: true },
    };
    /** Model of the record and its fields with their empty value. */
    static resModel = "";
    static defaults = {};

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ ...this.emptyValues(), error: null, saving: false, fresh: false, choices: {} });
        onWillStart(() => this.load());
    }
    emptyValues() {
        const values = { ...this.constructor.defaults };
        for (const [key, value] of Object.entries(this.props.context || {})) {
            if (key.startsWith("default_") && key.slice(8) in values) {
                values[key.slice(8)] = value;
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
    /** server record → the values of the drawer */
    fromRecord(rec) {
        const values = {};
        for (const name of this.fieldNames) {
            const v = rec[name];
            values[name] = Array.isArray(v) ? v[0] : v === false ? this.constructor.defaults[name] : v;
        }
        return values;
    }
    /** values of the drawer → values to write */
    toValues() {
        const vals = {};
        for (const name of this.fieldNames) {
            const v = this.state[name];
            vals[name] = v === "" || v === null || v === undefined ? false : v;
        }
        return vals;
    }
    validate() {
        return null;
    }
    async load() {
        await this.loadChoices();
        if (!this.props.resId) {
            return;
        }
        const [rec] = await this.orm.read(this.constructor.resModel, [this.props.resId], this.fieldNames);
        if (rec) {
            Object.assign(this.state, this.fromRecord(rec));
        }
    }
    resetForm() {
        Object.assign(this.state, this.emptyValues(), { error: null, saving: false, fresh: true });
    }
    async save() {
        const error = this.validate();
        if (error) {
            this.state.error = error;
            return;
        }
        this.state.error = null;
        this.state.saving = true;
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
    /** Odoo's own form of the record as a full page (every field, chatter, smart buttons). */
    openFullForm() {
        const resId = this.isEdit ? this.props.resId : false;
        this.props.close();
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: this.constructor.resModel,
            res_id: resId || undefined,
            views: [[false, "form"]],
            target: "current",
            context: this.props.context || {},
        });
    }
}

const COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Department: name, parent, manager, colour. */
export class DepartmentDrawer extends QuickDrawer {
    static template = "employee_modern.DepartmentDrawer";
    static resModel = "hr.department";
    static defaults = { name: "", parent_id: "", manager_id: "", color: 0 };

    get colors() {
        return COLORS;
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Department") : _t("New department");
    }
    get subtitle() {
        return this.isEdit
            ? _t("A team of your company, with its manager.")
            : _t("Name the team and pick who leads it.");
    }
    get parentOptions() {
        const self = this.isEdit ? this.props.resId : false;
        return (this.state.choices.departments || [])
            .filter((d) => d.id !== self)
            .map((d) => ({ id: d.id, title: d.complete_name || d.name }));
    }
    get managerOptions() {
        return (this.state.choices.employees || []).map((e) => ({
            id: e.id,
            title: e.name,
            hint: e.job_title || (e.department_id ? e.department_id[1] : ""),
        }));
    }
    async loadChoices() {
        const [departments, employees] = await Promise.all([
            this.orm.searchRead("hr.department", [], ["name", "complete_name"]),
            this.orm.searchRead("hr.employee", [], ["name", "job_title", "department_id"], { order: "name" }),
        ]);
        departments.sort((a, b) => (a.complete_name || "").localeCompare(b.complete_name || ""));
        this.state.choices = { departments, employees };
    }
    validate() {
        return this.state.name.trim() ? null : _t("Give the department a name.");
    }
    toValues() {
        return { ...super.toValues(), name: this.state.name.trim(), color: this.state.color || 0 };
    }
}

/** Job position: name, department, employment type, recruitment target. */
export class JobDrawer extends QuickDrawer {
    static template = "employee_modern.JobDrawer";
    static resModel = "hr.job";
    static defaults = { name: "", department_id: "", contract_type_id: "", no_of_recruitment: 0 };

    get title() {
        return this.isEdit ? this.state.name || _t("Job position") : _t("New job position");
    }
    get subtitle() {
        return _t("A role in your company and how many people you want to hire for it.");
    }
    get departmentOptions() {
        return (this.state.choices.departments || []).map((d) => ({ id: d.id, title: d.complete_name || d.name }));
    }
    get contractTypes() {
        return this.state.choices.contractTypes || [];
    }
    async loadChoices() {
        const [departments, contractTypes] = await Promise.all([
            this.orm.searchRead("hr.department", [], ["name", "complete_name"]),
            this.orm.searchRead("hr.contract.type", [], ["name"]).catch(() => []),
        ]);
        departments.sort((a, b) => (a.complete_name || "").localeCompare(b.complete_name || ""));
        this.state.choices = { departments, contractTypes };
    }
    validate() {
        return this.state.name.trim() ? null : _t("Give the job position a name.");
    }
    toValues() {
        const vals = { ...super.toValues(), name: this.state.name.trim() };
        vals.no_of_recruitment = Math.max(0, parseInt(this.state.no_of_recruitment, 10) || 0);
        vals.contract_type_id = this.state.contract_type_id ? Number(this.state.contract_type_id) : false;
        return vals;
    }
}
