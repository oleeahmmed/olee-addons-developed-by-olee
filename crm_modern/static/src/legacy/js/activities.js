import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { UI } from "../components/ui";
import { ACTIVITY_FIELDS, loadActivityTypes, useActivityActions, useLeadActions } from "../core/hooks";
import { dueInfo, shortDate } from "../core/utils";

const GROUPS = [
    { key: "overdue", label: "Overdue", icon: "fa-exclamation-triangle" },
    { key: "today", label: "Today", icon: "fa-calendar" },
    { key: "planned", label: "Planned", icon: "fa-calendar-o" },
];

/** Every open activity on leads and opportunities (mail.activity). */
export class Activities extends Component {
    static template = "crm_modern.Activities";
    static components = { ...UI };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.groups = GROUPS;
        this.state = useState({ loading: true, items: [], types: {}, users: [], type: "", who: String(user.userId) });
        this.activity = useActivityActions(() => this.loadItems());
        this.lead = useLeadActions(() => this.loadItems());
        onWillStart(() => this.load());
    }

    async load() {
        const [types, users] = await Promise.all([
            loadActivityTypes(this.orm),
            this.orm.searchRead("res.users", [["share", "=", false]], ["name"], { order: "name" }),
        ]);
        Object.assign(this.state, { types, users });
        await this.loadItems();
    }

    async loadItems() {
        const d = [["res_model", "=", "crm.lead"]];
        if (this.state.type) {
            d.push(["activity_type_id", "=", Number(this.state.type)]);
        }
        if (this.state.who) {
            d.push(["user_id", "=", Number(this.state.who)]);
        }
        this.state.items = await this.orm.searchRead("mail.activity", d, ACTIVITY_FIELDS, { order: "date_deadline asc", limit: 400 });
        this.state.loading = false;
    }

    setFilter(key, value) {
        this.state[key] = value;
        this.loadItems();
    }
    itemsOf(key) {
        return this.state.items.filter((a) => dueInfo(a.date_deadline).state === key);
    }
    count(key) {
        return this.itemsOf(key).length;
    }
    get typeList() {
        return Object.values(this.state.types)
            .filter((t) => !t.res_model || t.res_model === "crm.lead")
            .sort((a, b) => a.sequence - b.sequence);
    }
    shortDate(v) {
        return shortDate(v);
    }
}

registry.category("actions").add("crm_modern.activities", Activities);
