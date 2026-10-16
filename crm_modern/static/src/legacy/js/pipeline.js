import { Component, onWillStart, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useDebounced } from "@web/core/utils/timing";
import { QuickCreateDialog } from "../components/dialogs";
import { UI } from "../components/ui";
import { NativeView } from "../components/native_view";
import { leadNativeProps, leadViewOptions, readStoredView, storeView } from "../core/lead_views";
import { loadActivityTypes, useLeadActions } from "../core/hooks";
import { money, moneyShort, shortDate } from "../core/utils";

const VIEW_KEY = "crm_modern.pipeline.view.v2";
export const LEAD_FIELDS = [
    "name", "partner_name", "contact_name", "email_from", "phone", "expected_revenue", "probability",
    "stage_id", "user_id", "team_id", "tag_ids", "priority", "won_status", "active", "campaign_id",
    "activity_date_deadline", "activity_type_id", "activity_state", "date_deadline", "company_currency", "is_rotting", "rotting_days",
];

export class Pipeline extends Component {
    static template = "crm_modern.Pipeline";
    static components = { ...UI, Dropdown, DropdownItem, NativeView };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.lead = useLeadActions(() => this.load());
        const ctx = this.props.action?.context || {};
        const view = readStoredView(VIEW_KEY, "board");
        this.viewOptions = leadViewOptions({ value: "board", label: "Board", icon: "fa-trello" });
        this.state = useState({
            loading: true, view, q: "", user: ctx.crm_modern_user_id || "", team: "", tag: "",
            campaign: ctx.crm_modern_campaign_id || "", status: "active",
            stages: [], records: [], users: [], teams: [], tags: {}, campaigns: [], types: {},
            dragId: null, overStage: null, viewIds: {},
        });
        this.reloadDebounced = useDebounced(() => this.loadRecords(), 250);
        onWillStart(() => this.load());
    }

    async load() {
        const [stages, users, teams, tags, campaigns, types, viewIds] = await Promise.all([
            this.orm.searchRead("crm.stage", [], ["name", "sequence", "is_won", "fold", "team_ids"], { order: "sequence, id" }),
            this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" }),
            this.orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" }),
            this.orm.searchRead("crm.tag", [], ["name", "color"]),
            this.orm.searchRead("utm.campaign", [], ["title"], { order: "id desc" }),
            loadActivityTypes(this.orm),
            this.orm.call("crm.lead", "crm_modern_view_ids", []),
        ]);
        Object.assign(this.state, {
            stages, users, teams, campaigns, types, viewIds,
            tags: Object.fromEntries(tags.map((t) => [t.id, t])),
        });
        await this.loadRecords();
    }

    get domain() {
        const s = this.state;
        const d = [["type", "=", "opportunity"]];
        if (s.status === "won") {
            d.push(["won_status", "=", "won"]);
        } else if (s.status === "lost") {
            d.push(["won_status", "=", "lost"], ["active", "=", false]);
        } else {
            d.push(["active", "=", true]);
        }
        if (s.user) {
            d.push(["user_id", "=", Number(s.user)]);
        }
        if (s.team) {
            d.push(["team_id", "=", Number(s.team)]);
        }
        if (s.tag) {
            d.push(["tag_ids", "in", [Number(s.tag)]]);
        }
        if (s.campaign) {
            d.push(["campaign_id", "=", Number(s.campaign)]);
        }
        if (s.q.trim()) {
            const q = s.q.trim();
            d.push("|", "|", "|", ["name", "ilike", q], ["partner_name", "ilike", q], ["contact_name", "ilike", q], ["email_from", "ilike", q]);
        }
        return d;
    }

    async loadRecords() {
        this.state.records = await this.orm.searchRead("crm.lead", this.domain, LEAD_FIELDS, {
            order: "priority desc, id desc",
            limit: 500,
            context: { active_test: false },
        });
        this.state.loading = false;
    }

    setFilter(key, value) {
        this.state[key] = value;
        this.loadRecords();
    }
    onSearch(ev) {
        this.state.q = ev.target.value;
        this.reloadDebounced();
    }
    setView(view) {
        this.state.view = view;
        storeView(VIEW_KEY, view);
        if (view === "board") {
            this.loadRecords();
        }
    }
    get isNative() {
        return this.state.view !== "board";
    }
    get nativeProps() {
        return leadNativeProps({
            kind: "opportunity",
            view: this.state.view,
            viewIds: this.state.viewIds,
            campaignId: this.state.campaign,
            userId: this.state.user,
            onOpen: (id) => this.lead.open(id),
            onCreate: () => this.create(),
        });
    }

    get currency() {
        return this.state.records[0]?.company_currency?.[0];
    }
    get total() {
        return this.state.records.reduce((s, r) => s + r.expected_revenue, 0);
    }
    get columns() {
        const teamFilter = Number(this.state.team);
        return this.state.stages
            .filter((st) => !st.team_ids.length || !teamFilter || st.team_ids.includes(teamFilter))
            .map((st) => {
                const cards = this.state.records.filter((r) => r.stage_id && r.stage_id[0] === st.id);
                return { stage: st, cards, sum: cards.reduce((s, r) => s + r.expected_revenue, 0) };
            });
    }
    tagsOf(rec) {
        return rec.tag_ids.map((id) => this.state.tags[id]).filter(Boolean);
    }
    m(v) {
        return money(v, this.currency);
    }
    ms(v) {
        return moneyShort(v, this.currency);
    }
    shortDate(v) {
        return shortDate(v);
    }

    // ---------- drag & drop ----------
    onDragStart(ev, rec) {
        ev.dataTransfer.effectAllowed = "move";
        this.state.dragId = rec.id;
    }
    onDragLeave(stageId) {
        if (this.state.overStage === stageId) {
            this.state.overStage = null;
        }
    }
    onDragEnd() {
        this.state.dragId = null;
        this.state.overStage = null;
    }
    async onDrop(stageId) {
        const id = this.state.dragId;
        this.onDragEnd();
        const rec = this.state.records.find((r) => r.id === id);
        if (!rec || rec.stage_id[0] === stageId) {
            return;
        }
        const stage = this.state.stages.find((s) => s.id === stageId);
        rec.stage_id = [stageId, stage.name]; // optimistic
        await this.moveTo(rec, stage);
    }
    async moveTo(rec, stage) {
        await this.orm.write("crm.lead", [rec.id], { stage_id: stage.id });
        await this.loadRecords();
    }
    async setPriority(rec, value) {
        rec.priority = value;
        await this.orm.write("crm.lead", [rec.id], { priority: value });
    }

    create(stageId) {
        return new Promise((resolve) => this.dialog.add(QuickCreateDialog, {
            type: "opportunity",
            defaults: {
                stage_id: stageId || "",
                campaign_id: this.state.campaign || "",
                team_id: this.state.team || "",
            },
            onSaved: () => this.loadRecords(),
        }, { onClose: resolve }));
    }
}

registry.category("actions").add("crm_modern.pipeline", Pipeline);
