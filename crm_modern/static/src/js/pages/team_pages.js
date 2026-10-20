import { Component, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { UI } from "../components/ui";
import { FormDrawer } from "../components/form_drawer";
import { OrSelectCard } from "@modern_theme/js/or_select_card";
import { money, openInDialog } from "../core/utils";

/** Shared add/remove of salespeople on crm.team (through member_ids, so Odoo's membership rules apply). */
function useMembership(onChanged) {
    const orm = useService("orm");
    const notification = useService("notification");
    return {
        async add(teamId, userId, userName) {
            if (!userId) {
                return;
            }
            await orm.write("crm.team", [teamId], { member_ids: [[4, Number(userId)]] });
            notification.add(_t("%s added to the team", userName || ""), { type: "success" });
            onChanged();
        },
        async remove(teamId, userId, userName) {
            await orm.write("crm.team", [teamId], { member_ids: [[3, Number(userId)]] });
            notification.add(_t("%s removed from the team", userName || ""), { type: "info" });
            onChanged();
        },
    };
}

/** Right-sheet create / edit for a sales team. */
export class TeamDialog extends Component {
    static template = "crm_modern.TeamDialog";
    static components = { FormDrawer, OrSelectCard };
    static props = {
        close: Function,
        users: { type: Array, optional: true },
        onSaved: { type: Function, optional: true },
        resId: { type: [Number, Boolean], optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            users: this.props.users || [],
            name: "",
            user_id: "",
            alias_name: "",
            use_leads: false,
            use_opportunities: true,
            assignment_optout: false,
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
        return _t("New sales team");
    }
    get title() {
        return this.isEdit ? this.state.name || _t("Sales team") : _t("New sales team");
    }
    get subtitle() {
        return this.isEdit
            ? _t("Name, leader and how this team takes leads.")
            : _t("Name the team and pick a leader. Add salespeople from the list.");
    }
    get userCardOptions() {
        return this.state.users.map((u) => ({
            id: u.id,
            title: u.name,
            hint: _t("Team leader"),
        }));
    }
    async load() {
        if (!this.state.users.length) {
            this.state.users = await this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" });
        }
        if (!this.props.resId) {
            return;
        }
        const [team] = await this.orm.read("crm.team", [this.props.resId], [
            "name", "user_id", "alias_name", "use_leads", "use_opportunities", "assignment_optout",
        ]);
        if (!team) {
            return;
        }
        Object.assign(this.state, {
            name: team.name || "",
            user_id: team.user_id ? team.user_id[0] : "",
            alias_name: team.alias_name || "",
            use_leads: Boolean(team.use_leads),
            use_opportunities: Boolean(team.use_opportunities),
            assignment_optout: Boolean(team.assignment_optout),
        });
    }
    resetForm() {
        Object.assign(this.state, {
            name: "", user_id: "", alias_name: "", use_leads: false, use_opportunities: true,
            assignment_optout: false, error: null, saving: false, fresh: true,
        });
    }
    async save() {
        const s = this.state;
        if (!s.name.trim()) {
            s.error = _t("Give the team a name.");
            return;
        }
        s.saving = true;
        const leader = Number(s.user_id) || false;
        const vals = {
            name: s.name.trim(),
            user_id: leader,
            alias_name: s.alias_name.trim() || false,
            use_leads: s.use_leads,
            use_opportunities: s.use_opportunities,
            assignment_optout: s.assignment_optout,
        };
        try {
            let id = this.isEdit ? this.props.resId : false;
            if (id) {
                await this.orm.write("crm.team", [id], vals);
            } else {
                if (leader) {
                    vals.member_ids = [[4, leader]];
                }
                [id] = await this.orm.create("crm.team", [vals]);
            }
            this.props.onSaved?.(id);
            this.props.close();
        } catch (e) {
            s.saving = false;
            throw e;
        }
    }
}

/** Sales team page: team settings on top, member lines below. */
export class TeamDetail extends Component {
    static template = "crm_modern.TeamDetail";
    static components = { ...UI };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.state = useState({ loading: true, data: null, users: [], newUser: "", canEdit: false });
        this.members = useMembership(() => this.reload());
        onWillStart(() => this.load(this.props));
        onWillUpdateProps((next) => this.load(next));
    }

    get teamId() {
        return this.props.action?.context?.active_id;
    }

    async load(props) {
        const id = props.action?.context?.active_id;
        const [data, users, canEdit] = await Promise.all([
            id ? this.orm.call("crm.lead", "crm_modern_team_detail", [id]) : false,
            this.orm.searchRead("res.users", [["share", "=", false]], ["name", "email"], { order: "name" }),
            // Odoo's own rule: only sales managers may change teams (ir.model.access on crm.team)
            user.checkAccessRight("crm.team", "write").catch(() => false),
        ]);
        Object.assign(this.state, { data, users, canEdit, loading: false });
    }
    async reload() {
        this.state.data = await this.orm.call("crm.lead", "crm_modern_team_detail", [this.teamId]);
    }

    get canEdit() {
        return this.state.canEdit;
    }
    get teamInfo() {
        return this.state.data.team;
    }
    get candidates() {
        const taken = new Set(this.state.data.members.map((m) => m.user_id && m.user_id[0]));
        return this.state.users.filter((u) => !taken.has(u.id));
    }
    m(v) {
        return money(v, this.state.data.currency_id);
    }

    async write(vals) {
        await this.orm.write("crm.team", [this.teamId], vals);
        this.notification.add(_t("Saved"), { type: "success" });
        await this.reload();
    }
    onName(ev) {
        const name = ev.target.value.trim();
        if (name && name !== this.teamInfo.name) {
            this.write({ name });
        }
    }
    onAlias(ev) {
        const alias = ev.target.value.trim();
        if (alias !== (this.teamInfo.alias_name || "")) {
            this.write({ alias_name: alias || false });
        }
    }
    onLeader(ev) {
        this.write({ user_id: Number(ev.target.value) || false });
    }
    async writeMember(member, vals) {
        await this.orm.write("crm.team.member", [member.id], vals);
        await this.reload();
    }
    onCapacity(member, ev) {
        const value = Math.max(0, Number(ev.target.value) || 0);
        if (value !== member.assignment_max) {
            this.writeMember(member, { assignment_max: value });
        }
    }
    addMember() {
        const id = Number(this.state.newUser);
        const user = this.state.users.find((u) => u.id === id);
        this.state.newUser = "";
        this.members.add(this.teamId, id, user?.name);
    }
    async toggleArchive() {
        await this.orm.call("crm.team", this.teamInfo.active ? "action_archive" : "action_unarchive", [[this.teamId]]);
        await this.reload();
    }
    openForm() {
        openInDialog(this.action, {
            type: "ir.actions.act_window",
            name: this.teamInfo.name,
            res_model: "crm.team",
            res_id: this.teamId,
            views: [[false, "form"]],
            target: "new",
        }).then(() => this.reload());
    }
    openPipeline(userId) {
        this.action.doAction("crm_modern.action_pipeline", {
            additionalContext: userId ? { crm_modern_user_id: userId } : {},
        });
    }
    back() {
        this.action.doAction("crm_modern.action_teams");
    }
}

registry.category("actions").add("crm_modern.team", TeamDetail);
