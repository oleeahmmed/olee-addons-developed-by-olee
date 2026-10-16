import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { UI } from "../components/ui";
import { openInDialog } from "../core/utils";

const CATEGORY = {
    default: _t("None"),
    upload_file: _t("Upload Document"),
    phonecall: _t("Phonecall"),
    meeting: _t("Meeting"),
};
const UNIT = { days: _t("days"), weeks: _t("weeks"), months: _t("months") };

function plural(count, unit) {
    const label = UNIT[unit] || unit;
    return count === 1 ? label.replace(/s$/, "") : label;
}

function formAction(resModel, resId, name, context = {}) {
    return {
        type: "ir.actions.act_window",
        name,
        res_model: resModel,
        res_id: resId || false,
        views: [[false, "form"]],
        target: "new",
        context,
    };
}

// ---------------------------------------------------------------- stages
export class Stages extends Component {
    static template = "crm_modern.Stages";
    static components = { ...UI };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.state = useState({ loading: true, stages: [], counts: {}, newName: "" });
        onWillStart(() => this.load());
    }

    async load() {
        const [stages, groups] = await Promise.all([
            this.orm.searchRead("crm.stage", [], ["name", "sequence", "is_won", "fold", "team_ids", "rotting_threshold_days"], { order: "sequence, id" }),
            this.orm.formattedReadGroup("crm.lead", [["type", "=", "opportunity"]], ["stage_id"], ["__count", "expected_revenue:sum"]),
        ]);
        const counts = {};
        for (const g of groups) {
            if (g.stage_id) {
                counts[g.stage_id[0]] = { count: g.__count, revenue: g["expected_revenue:sum"] };
            }
        }
        Object.assign(this.state, { stages, counts, loading: false });
    }

    async save(stage, vals) {
        await this.orm.write("crm.stage", [stage.id], vals);
        await this.load();
    }
    rename(stage, ev) {
        const name = ev.target.value.trim();
        if (name && name !== stage.name) {
            this.save(stage, { name });
        }
    }
    setRotting(stage, ev) {
        this.save(stage, { rotting_threshold_days: Math.max(0, Number(ev.target.value) || 0) });
    }
    async move(index, dir) {
        const list = [...this.state.stages];
        const j = index + dir;
        if (j < 0 || j >= list.length) {
            return;
        }
        [list[index], list[j]] = [list[j], list[index]];
        await this.orm.webResequence("crm.stage", list.map((s) => s.id), { field_name: "sequence" });
        await this.load();
    }
    async remove(stage) {
        if (this.state.counts[stage.id]?.count) {
            this.notification.add(_t("“%s” still has opportunities. Move them to another stage first.", stage.name), { type: "warning" });
            return;
        }
        await this.orm.unlink("crm.stage", [stage.id]);
        await this.load();
    }
    async add(ev) {
        ev.preventDefault();
        const name = this.state.newName.trim();
        if (!name) {
            return;
        }
        const seq = Math.max(0, ...this.state.stages.map((s) => s.sequence)) + 1;
        await this.orm.create("crm.stage", [{ name, sequence: seq }]);
        this.state.newName = "";
        await this.load();
    }
    edit(stage) {
        openInDialog(this.action, formAction("crm.stage", stage.id, stage.name)).then(() => this.load());
    }
}

// ---------------------------------------------------------------- activity types
export class ActivityTypes extends Component {
    static template = "crm_modern.ActivityTypes";
    static components = { ...UI };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.category = CATEGORY;
        this.state = useState({ loading: true, types: [], names: {}, planned: {}, show: "active" });
        onWillStart(() => this.load());
    }

    async load() {
        const domain = [["res_model", "in", [false, "crm.lead"]], ["active", "=", this.state.show === "active"]];
        const [types, all, groups] = await Promise.all([
            this.orm.searchRead("mail.activity.type", domain, [
                "name", "icon", "category", "decoration_type", "summary", "delay_count", "delay_unit", "delay_from",
                "chaining_type", "suggested_next_type_ids", "triggered_next_type_id", "default_user_id", "res_model", "sequence", "active",
            ], { order: "sequence, id", context: { active_test: false } }),
            this.orm.searchRead("mail.activity.type", [], ["name"], { context: { active_test: false } }),
            this.orm.formattedReadGroup("mail.activity", [["res_model", "=", "crm.lead"]], ["activity_type_id"], ["__count"]),
        ]);
        const planned = {};
        for (const g of groups) {
            if (g.activity_type_id) {
                planned[g.activity_type_id[0]] = g.__count;
            }
        }
        Object.assign(this.state, { types, names: Object.fromEntries(all.map((t) => [t.id, t.name])), planned, loading: false });
    }

    delay(t) {
        if (!t.delay_count) {
            return _t("Same day");
        }
        return `${t.delay_count} ${plural(t.delay_count, t.delay_unit)}`;
    }
    setShow(v) {
        this.state.show = v;
        this.load();
    }
    edit(id) {
        openInDialog(this.action, formAction("mail.activity.type", id, id ? _t("Activity type") : _t("New activity type"),
            { default_res_model: "crm.lead" })).then(() => this.load());
    }
}

// ---------------------------------------------------------------- activity plans
export class ActivityPlans extends Component {
    static template = "crm_modern.ActivityPlans";
    static components = { ...UI };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ loading: true, plans: [], templates: {}, types: {} });
        onWillStart(() => this.load());
    }

    async load() {
        const plans = await this.orm.searchRead("mail.activity.plan", [["res_model", "in", [false, "crm.lead"]]],
            ["name", "active", "template_ids", "res_model", "steps_count", "has_user_on_demand"], { order: "id", context: { active_test: false } });
        const templateIds = plans.flatMap((p) => p.template_ids);
        const [templates, types] = await Promise.all([
            templateIds.length
                ? this.orm.read("mail.activity.plan.template", templateIds,
                    ["activity_type_id", "summary", "delay_count", "delay_unit", "delay_from", "responsible_type", "responsible_id", "sequence"])
                : [],
            this.orm.searchRead("mail.activity.type", [], ["name", "icon", "category", "decoration_type"], { context: { active_test: false } }),
        ]);
        Object.assign(this.state, {
            plans,
            templates: Object.fromEntries(templates.map((t) => [t.id, t])),
            types: Object.fromEntries(types.map((t) => [t.id, t])),
            loading: false,
        });
    }

    stepsOf(plan) {
        return plan.template_ids.map((id) => this.state.templates[id]).filter(Boolean).sort((a, b) => a.sequence - b.sequence);
    }
    delay(step) {
        if (!step.delay_count) {
            return _t("On plan date");
        }
        const where = step.delay_from === "before_plan_date" ? _t("before") : _t("after");
        return `${step.delay_count} ${plural(step.delay_count, step.delay_unit)} ${where} ${_t("plan date")}`;
    }
    edit(id) {
        openInDialog(this.action, formAction("mail.activity.plan", id, id ? _t("Activity plan") : _t("New activity plan"),
            { default_res_model: "crm.lead", dialog_size: "large" })).then(() => this.load());
    }
}

// ---------------------------------------------------------------- tags
export class Tags extends Component {
    static template = "crm_modern.Tags";
    static components = { ...UI };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.colors = [...Array(12).keys()];
        this.colorNames = ["No color", "Red", "Orange", "Yellow", "Cyan", "Purple", "Almond", "Teal", "Blue", "Raspberry", "Green", "Violet"];
        this.state = useState({ loading: true, tags: [], usage: {}, q: "", newName: "", newColor: 8, picking: null });
        onWillStart(() => this.load());
    }

    async load() {
        const [tags, groups] = await Promise.all([
            this.orm.searchRead("crm.tag", [], ["name", "color"], { order: "name" }),
            this.orm.formattedReadGroup("crm.lead", [], ["tag_ids", "type"], ["__count"], { context: { active_test: false } }),
        ]);
        const usage = {};
        for (const g of groups) {
            if (g.tag_ids) {
                const u = (usage[g.tag_ids[0]] ||= { lead: 0, opportunity: 0 });
                u[g.type] = (u[g.type] || 0) + g.__count;
            }
        }
        Object.assign(this.state, { tags, usage, loading: false });
    }

    get filtered() {
        const q = this.state.q.trim().toLowerCase();
        return q ? this.state.tags.filter((t) => t.name.toLowerCase().includes(q)) : this.state.tags;
    }
    async add(ev) {
        ev.preventDefault();
        const name = this.state.newName.trim();
        if (!name) {
            return;
        }
        if (this.state.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
            this.notification.add(_t("Tag “%s” already exists", name), { type: "warning" });
            return;
        }
        await this.orm.create("crm.tag", [{ name, color: this.state.newColor }]);
        this.state.newName = "";
        await this.load();
    }
    async rename(tag, ev) {
        const name = ev.target.value.trim();
        if (name && name !== tag.name) {
            await this.orm.write("crm.tag", [tag.id], { name });
            await this.load();
        }
    }
    async setColor(tag, color) {
        this.state.picking = null;
        await this.orm.write("crm.tag", [tag.id], { color });
        await this.load();
    }
    async remove(tag) {
        const u = this.state.usage[tag.id] || {};
        const n = (u.lead || 0) + (u.opportunity || 0);
        if (n && !window.confirm(_t("Delete tag “%(tag)s”? It is removed from %(count)s records.", { tag: tag.name, count: n }))) {
            return;
        }
        await this.orm.unlink("crm.tag", [tag.id]);
        await this.load();
    }
}

registry.category("actions").add("crm_modern.stages", Stages);
registry.category("actions").add("crm_modern.activity_types", ActivityTypes);
registry.category("actions").add("crm_modern.activity_plans", ActivityPlans);
registry.category("actions").add("crm_modern.tags", Tags);
