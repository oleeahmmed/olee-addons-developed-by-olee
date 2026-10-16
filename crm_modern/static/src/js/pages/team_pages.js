import { Component, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { UI } from "../components/ui";
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

/** Small dialog to create a team, then open its page. */
export class TeamDialog extends Component {
    static template = "crm_modern.TeamDialog";
    static components = { Dialog };
    static props = { close: Function, users: Array, onSaved: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ name: "", user_id: "", error: null });
    }
    async save() {
        if (!this.state.name.trim()) {
            this.state.error = _t("Team name is required.");
            return;
        }
        const leader = Number(this.state.user_id) || false;
        const [id] = await this.orm.create("crm.team", [{
            name: this.state.name.trim(),
            user_id: leader,
            member_ids: leader ? [[4, leader]] : [],
        }]);
        this.props.close();
        this.props.onSaved(id);
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
