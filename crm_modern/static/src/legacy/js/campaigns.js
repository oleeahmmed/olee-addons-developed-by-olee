import { Component, onWillStart, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { CampaignDialog, QuickCreateDialog } from "../components/dialogs";
import { ImportDialog } from "../components/import_dialog";
import { NativeView } from "../components/native_view";
import { UI } from "../components/ui";
import { money } from "../core/utils";

const VIEW_KEY = "crm_modern.campaigns.view";
const CAMPAIGN_FIELDS = [
    "title", "user_id", "simple_team_id", "stage_id", "active", "simple_lead_count", "simple_opportunity_count",
    "simple_open_count", "simple_won_count", "simple_lost_count", "simple_won_revenue",
];

/** utm.campaign cards with CRM Simple's team field, counters and CSV upload. */
export class Campaigns extends Component {
    static template = "crm_modern.Campaigns";
    static components = { ...UI, Dropdown, DropdownItem, NativeView };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        let view = "kanban";
        try {
            view = window.localStorage.getItem(VIEW_KEY) || "kanban";
        } catch {
            // storage unavailable
        }
        if (view === "cards") {
            view = "kanban";
            try {
                window.localStorage.setItem(VIEW_KEY, view);
            } catch {
                // storage unavailable
            }
        }
        this.viewOptions = [
            { value: "kanban", label: _t("Kanban"), icon: "fa-columns" },
            { value: "list", label: _t("List"), icon: "fa-list-ul" },
            { value: "calendar", label: _t("Calendar"), icon: "fa-calendar" },
            { value: "pivot", label: _t("Pivot"), icon: "fa-table" },
            { value: "graph", label: _t("Graph"), icon: "fa-bar-chart" },
            { value: "activity", label: _t("Activity"), icon: "fa-clock-o" },
        ];
        this.state = useState({
            loading: true, campaigns: [], stages: [], teams: [], users: [], members: {}, currency: false, show: "active", q: "",
            view, viewIds: {}, dragId: null, overStage: null,
        });
        onWillStart(() => this.load());
    }

    async load() {
        const [teams, users, members, stages, [company], viewIds] = await Promise.all([
            this.orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" }),
            this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" }),
            this.orm.searchRead("crm.team.member", [], ["crm_team_id", "user_id"]),
            this.orm.searchRead("utm.stage", [], ["name", "sequence"], { order: "sequence, id" }),
            this.orm.read("res.company", [user.activeCompany.id], ["currency_id"]),
            this.orm.call("crm.lead", "crm_modern_view_ids", []),
        ]);
        this.state.viewIds = viewIds;
        const byTeam = {};
        for (const m of members) {
            if (m.crm_team_id && m.user_id) {
                (byTeam[m.crm_team_id[0]] ||= []).push({ id: m.user_id[0], name: m.user_id[1] });
            }
        }
        Object.assign(this.state, { teams, users, stages, members: byTeam, currency: company.currency_id[0] });
        await this.loadCampaigns();
    }

    async loadCampaigns() {
        const domain = [["active", "=", this.state.show === "active"]];
        if (this.state.q.trim()) {
            domain.push(["title", "ilike", this.state.q.trim()]);
        }
        this.state.campaigns = await this.orm.searchRead("utm.campaign", domain, CAMPAIGN_FIELDS, {
            order: "id desc", context: { active_test: false },
        });
        this.state.loading = false;
    }

    get totals() {
        const c = this.state.campaigns;
        const sum = (f) => c.reduce((s, x) => s + (x[f] || 0), 0);
        return { leads: sum("simple_lead_count"), opps: sum("simple_opportunity_count"), won: sum("simple_won_count"), revenue: sum("simple_won_revenue") };
    }
    m(v) {
        return money(v, this.state.currency);
    }
    get isNative() {
        return this.state.view !== "kanban";
    }
    get columns() {
        const grouped = new Map();
        for (const campaign of this.state.campaigns) {
            const stageId = campaign.stage_id ? campaign.stage_id[0] : 0;
            if (!grouped.has(stageId)) {
                grouped.set(stageId, []);
            }
            grouped.get(stageId).push(campaign);
        }
        const columns = this.state.stages.map((stage) => ({
            stage,
            cards: grouped.get(stage.id) || [],
        }));
        const known = new Set(this.state.stages.map((stage) => stage.id));
        for (const [stageId, cards] of grouped) {
            if (stageId && !known.has(stageId)) {
                columns.push({
                    stage: { id: stageId, name: cards[0].stage_id[1] || _t("Stage") },
                    cards,
                });
            }
        }
        const loose = grouped.get(0);
        if (loose?.length) {
            columns.push({ stage: { id: 0, name: _t("No stage") }, cards: loose });
        }
        return columns;
    }
    get nativeProps() {
        const v = this.state.view;
        return {
            resModel: "utm.campaign",
            type: v,
            viewId: this.state.viewIds["campaign_" + v] || false,
            searchViewId: this.state.viewIds.campaign_search || false,
            onCreate: () => new Promise((resolve) => this.dialog.add(CampaignDialog, { onSaved: resolve }, { onClose: resolve })),
        };
    }
    setView(view) {
        this.state.view = view;
        try {
            window.localStorage.setItem(VIEW_KEY, view);
        } catch {
            // ignore
        }
    }
    setShow(v) {
        this.state.show = v;
        this.loadCampaigns();
    }
    onSearch(ev) {
        this.state.q = ev.target.value;
        this.loadCampaigns();
    }

    async setTeam(c, ev) {
        const teamId = Number(ev.target.value) || false;
        await this.orm.write("utm.campaign", [c.id], { simple_team_id: teamId });
        const name = this.state.teams.find((t) => t.id === teamId)?.name || _t("no team");
        this.notification.add(_t("%(campaign)s → %(team)s", { campaign: c.title, team: name }), { type: "success" });
        this.loadCampaigns();
    }
    async setUser(c, ev) {
        await this.orm.write("utm.campaign", [c.id], { user_id: Number(ev.target.value) || false });
        this.loadCampaigns();
    }

    open(xmlid, c) {
        this.action.doAction(xmlid, { additionalContext: { crm_modern_campaign_id: c.id } });
    }
    upload(c) {
        this.dialog.add(ImportDialog, { campaign: c, onImported: () => this.loadCampaigns() });
    }
    add(c, type) {
        this.dialog.add(QuickCreateDialog, {
            type,
            defaults: { campaign_id: c.id, team_id: c.simple_team_id ? c.simple_team_id[0] : "", user_id: c.user_id ? c.user_id[0] : "" },
            onSaved: () => this.loadCampaigns(),
        });
    }
    onDragStart(ev, campaign) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", String(campaign.id));
        this.state.dragId = campaign.id;
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
    async moveTo(campaign, stage) {
        campaign.stage_id = [stage.id, stage.name];
        await this.orm.write("utm.campaign", [campaign.id], { stage_id: stage.id });
        this.loadCampaigns();
    }
    async onDrop(stageId) {
        const id = this.state.dragId;
        this.onDragEnd();
        const campaign = this.state.campaigns.find((c) => c.id === id);
        const stage = this.state.stages.find((s) => s.id === stageId);
        if (!campaign || !stage || (campaign.stage_id && campaign.stage_id[0] === stage.id)) {
            return;
        }
        await this.moveTo(campaign, stage);
    }
    create(stageId) {
        const stage = typeof stageId === "number" ? stageId : false;
        this.dialog.add(CampaignDialog, {
            onSaved: async (id) => {
                if (stage && id) {
                    await this.orm.write("utm.campaign", [id], { stage_id: stage });
                }
                this.loadCampaigns();
            },
        });
    }
    openForm(c) {
        this.action.doAction({ type: "ir.actions.act_window", res_model: "utm.campaign", res_id: c.id, views: [[false, "form"]] });
    }
    async toggleArchive(c) {
        await this.orm.call("utm.campaign", c.active ? "action_archive" : "action_unarchive", [[c.id]]);
        this.loadCampaigns();
    }
}

registry.category("actions").add("crm_modern.campaigns", Campaigns);
