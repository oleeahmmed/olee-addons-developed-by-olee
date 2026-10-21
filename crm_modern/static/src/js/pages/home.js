/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { QuickCreateDialog } from "../components/dialogs";
import { loadFeatures } from "../core/features";
import { dueInfo, greeting, money, openRecord, shortDate } from "../core/utils";

/**
 * Working start: what is late, the deals assigned to you, and the newest leads.
 * The sidebar already lists the same screens, so Home does not repeat them.
 */
export class HomePage extends Component {
    static template = "crm_modern.Home";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.greeting = greeting();
        this.firstName = (user.name || "").split(" ")[0];
        this.state = useState({
            loading: true,
            useLeads: false,
            overdue: [],
            deals: [],
            leads: [],
            overdueCount: 0,
            dealCount: 0,
            leadCount: 0,
            currencyId: false,
            canCreate: false,
        });
        this.dialog = useService("dialog");
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("crm.lead", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    /** The page's one "+ New": the same quick form as the pipeline. */
    newOpportunity() {
        this.dialog.add(QuickCreateDialog, {
            type: "opportunity",
            defaults: {},
            onSaved: () => this.load(),
        });
    }

    async load() {
        const today = luxon.DateTime.local().toISODate();
        const overdueDomain = [["res_model", "=", "crm.lead"], ["date_deadline", "<", today]];
        const dealDomain = [["type", "=", "opportunity"], ["user_id", "=", user.userId], ["won_status", "=", "pending"]];
        const [features, overdue, deals, company, overdueCount, dealCount] = await Promise.all([
            loadFeatures(this.orm).catch(() => ({})),
            this.orm.searchRead(
                "mail.activity", overdueDomain,
                ["summary", "date_deadline", "res_id", "res_name", "activity_type_id"],
                { limit: 6, order: "date_deadline asc" }
            ).catch(() => []),
            this.orm.searchRead(
                "crm.lead", dealDomain,
                ["name", "expected_revenue", "stage_id", "partner_name", "company_currency"],
                { limit: 6, order: "expected_revenue desc" }
            ).catch(() => []),
            this.orm.searchRead("res.company", [["id", "=", user.activeCompany?.id || 1]], ["currency_id"], { limit: 1 }).catch(() => []),
            this.orm.searchCount("mail.activity", overdueDomain).catch(() => 0),
            this.orm.searchCount("crm.lead", dealDomain).catch(() => 0),
        ]);
        const useLeads = Boolean(features.use_leads);
        const leadDomain = [["type", "=", "lead"]];
        // "New leads" = created in the last 30 days (it used to count every lead ever).
        const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 19).replace("T", " ");
        const newLeadDomain = [...leadDomain, ["create_date", ">=", since]];
        const [leads, leadCount] = useLeads
            ? await Promise.all([
                this.orm.searchRead(
                    "crm.lead", leadDomain,
                    ["name", "email_from", "partner_name", "create_date"],
                    { limit: 6, order: "create_date desc" }
                ).catch(() => []),
                this.orm.searchCount("crm.lead", newLeadDomain).catch(() => 0),
            ])
            : [[], 0];
        Object.assign(this.state, {
            loading: false,
            useLeads,
            overdue,
            deals,
            leads,
            overdueCount,
            dealCount,
            leadCount,
            currencyId: deals[0]?.company_currency?.[0] || company[0]?.currency_id?.[0] || false,
        });
    }

    due(value) {
        return dueInfo(value);
    }
    money(amount) {
        return money(amount, this.state.currencyId);
    }
    shortDate(value) {
        return shortDate(value);
    }
    openDeal(id) {
        return openRecord(this.action, id);
    }
    open(xmlid) {
        return this.action.doAction(xmlid);
    }
}

registry.category("actions").add("crm_modern.home", HomePage);
