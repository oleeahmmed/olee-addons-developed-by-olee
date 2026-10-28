import { Component, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { Chatter } from "@mail/chatter/web_portal/chatter";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { MtDateInput } from "@modern_theme/js/app_kit/date_input";
import { RecordActions } from "../components/record_actions";
import { TagInput } from "../components/tag_input";
import { UI } from "../components/ui";
import { loadFeatures } from "../core/features";
import { ACTIVITY_FIELDS, loadActivityTypes, useActivityActions, useLeadActions } from "../core/hooks";
import { money, shortDate } from "../core/utils";

export const recordSections = registry.category("crm_modern.record_sections");

const FIELDS = [
    "name", "type", "active", "won_status", "partner_name", "contact_name", "email_from", "phone", "partner_id",
    "expected_revenue", "probability", "date_deadline", "user_id", "team_id", "tag_ids", "priority", "stage_id",
    "campaign_id", "source_id", "medium_id", "lost_reason_id", "create_date", "company_currency", "description",
];

/**
 * Opportunity / lead detail: compact header + stage stepper, deal facts on the
 * left, composer + chatter on the right.
 */
export class RecordPage extends Component {
    static template = "crm_modern.Record";
    static components = { ...UI, TagInput, Chatter, RecordActions, MtDateInput };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.dialog = useService("dialog");
        this.state = useState({
            loading: true, rec: null, canWrite: false, canUnlink: false, stages: [], activities: [], types: {},
            users: [], teams: [], campaigns: [], sources: [], tags: [], features: {}, chatterKey: 1,
        });
        this.activityActions = useActivityActions(() => this.reload());
        this.leadActions = useLeadActions(() => this.reload());
        onWillStart(() => this.load(this.props));
        onWillUpdateProps((next) => this.load(next));
    }

    get recordId() {
        return this.props.action?.context?.active_id;
    }

    async load(props) {
        const id = props.action?.context?.active_id;
        if (!id) {
            this.state.loading = false;
            return;
        }
        const [[rec], users, teams, campaigns, sources, types, features] = await Promise.all([
            this.orm.read("crm.lead", [id], FIELDS, { context: { active_test: false } }),
            this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" }),
            this.orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" }),
            this.orm.searchRead("utm.campaign", [], ["title"], { order: "title", limit: 200 }).catch(() => []),
            this.orm.searchRead("utm.source", [], ["name"], { order: "name", limit: 200 }).catch(() => []),
            loadActivityTypes(this.orm),
            loadFeatures(this.orm).catch(() => ({})),
        ]);
        Object.assign(this.state, { users, teams, campaigns, sources, types, features });
        await this.applyRecord(rec);
    }

    async applyRecord(rec) {
        const teamId = rec?.team_id?.[0];
        const [stages, activities, tags] = rec
            ? await Promise.all([
                  this.orm.searchRead("crm.stage", teamId ? ["|", ["team_ids", "=", false], ["team_ids", "in", [teamId]]] : [],
                      ["name", "is_won", "sequence"], { order: "sequence, id" }),
                  this.orm.searchRead("mail.activity", [["res_model", "=", "crm.lead"], ["res_id", "=", rec.id]],
                      ACTIVITY_FIELDS, { order: "date_deadline asc" }),
                  rec.tag_ids.length ? this.orm.read("crm.tag", rec.tag_ids, ["name", "color"]) : [],
              ])
            : [[], [], []];
        // Odoo's own rights for this very record (access rights + record rules)
        const [canWrite, canUnlink] = rec
            ? await Promise.all([
                  user.checkAccessRight("crm.lead", "write", [rec.id]).catch(() => false),
                  user.checkAccessRight("crm.lead", "unlink", [rec.id]).catch(() => false),
              ])
            : [false, false];
        const campaigns = this.withCurrent(this.state.campaigns, rec?.campaign_id, "title");
        const sources = this.withCurrent(this.state.sources, rec?.source_id, "name");
        Object.assign(this.state, { rec, stages, activities, tags, campaigns, sources, canWrite, canUnlink, loading: false });
    }

    async reload() {
        const [rec] = await this.orm.read("crm.lead", [this.recordId], FIELDS, { context: { active_test: false } });
        await this.applyRecord(rec);
        this.state.chatterKey++;
    }

    // ---------- helpers ----------
    get isOpp() {
        return this.state.rec?.type === "opportunity";
    }
    get stageIndex() {
        return this.state.stages.findIndex((s) => s.id === this.state.rec.stage_id?.[0]);
    }
    m(v) {
        return money(v, this.state.rec.company_currency?.[0]);
    }
    get currencyLabel() {
        return this.state.rec?.company_currency?.[1] || "";
    }
    /** Keep the record's current campaign or source selectable even past the search limit. */
    withCurrent(rows, current, labelField) {
        if (!current || rows.some((row) => row.id === current[0])) {
            return rows;
        }
        return [{ id: current[0], [labelField]: current[1] }, ...rows];
    }
    shortDate(v) {
        return shortDate(v);
    }

    async write(vals, { quiet = false } = {}) {
        await this.orm.write("crm.lead", [this.recordId], vals);
        if (!quiet) {
            this.notification.add(_t("Saved"), { type: "success" });
        }
        await this.reload();
    }
    onNumber(field, ev) {
        const value = Number(ev.target.value) || 0;
        if (value !== this.state.rec[field]) {
            this.write({ [field]: value });
        }
    }
    onDate(value) {
        // MtDateInput gives "yyyy-MM-dd" (or "" when cleared)
        this.write({ date_deadline: value || false });
    }
    /** crm.lead.description is an HTML field: edit it as plain text (one paragraph per line). */
    get notesText() {
        const html = (this.state.rec.description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n");
        const doc = new DOMParser().parseFromString(html, "text/html");
        return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    }
    onDescription(ev) {
        const value = ev.target.value.trim();
        if (value !== this.notesText) {
            const escape = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const html = value ? value.split("\n").map((line) => `<p>${escape(line) || "<br>"}</p>`).join("") : false;
            this.write({ description: html }, { quiet: true });
        }
    }
    get showContact() {
        const rec = this.state.rec;
        const company = rec.partner_id ? rec.partner_id[1] : rec.partner_name;
        return rec.contact_name && rec.contact_name !== company;
    }
    onMany2one(field, ev) {
        this.write({ [field]: Number(ev.target.value) || false });
    }
    setTags(tags) {
        this.state.tags = tags;
        this.write({ tag_ids: [[6, 0, tags.map((t) => t.id)]] }, { quiet: true });
    }
    setStage(stage) {
        if (stage.id !== this.state.rec.stage_id?.[0]) {
            this.write({ stage_id: stage.id }, { quiet: true });
        }
    }
    /** Sections other addons add below the activities card (see registry "crm_modern.record_sections"). */
    get recordSections() {
        return recordSections
            .getEntries()
            .filter(([, s]) => !s.isVisible || s.isVisible(this.state.rec, this.state.features))
            .map(([key, s]) => ({ key, Component: s.Component }));
    }
    get canWrite() {
        return this.state.canWrite;
    }
    get canUnlink() {
        return this.state.canUnlink;
    }
    confirmDelete() {
        this.dialog.add(ConfirmationDialog, {
            title: _t("Delete"),
            body: _t("Delete “%s”? This cannot be undone.", this.state.rec.name),
            confirmLabel: _t("Delete"),
            confirm: async () => {
                await this.orm.unlink("crm.lead", [this.recordId]);
                this.notification.add(_t("Deleted"), { type: "info" });
                this.back();
            },
            cancel: () => {},
        });
    }
    back() {
        this.action.doAction(this.isOpp ? "crm_modern.action_pipeline" : "crm_modern.action_leads");
    }
}

registry.category("actions").add("crm_modern.record", RecordPage);
