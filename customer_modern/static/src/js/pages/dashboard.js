import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { OD_COMPONENTS, compareWord, moneyFormatters, number, periodCaption, loadDashboard, dayStart } from "@modern_theme/js/app_kit/dash_kit";
import { greeting, shortDate } from "@modern_theme/js/app_kit/utils";
import { openFullForm } from "./list_pages";

const STORE_KEY = "customer_modern.dashboard";

function remembered() {
    try {
        return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

/**
 * Owner dashboard of the Contacts app: how the address book grows, where people are,
 * what to tidy up and — when Sales, Purchase or Invoicing are installed — who buys,
 * who sells to us and who owes us. One server call (res.partner.customer_modern_dashboard),
 * read with the user's own rights.
 */
export class ContactsDashboard extends Component {
    static template = "customer_modern.Dashboard";
    static components = { ...OD_COMPONENTS };
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        const saved = remembered();
        this.state = useState({
            loading: true,
            busy: false,
            error: false,
            data: null,
            canCreate: false,
            period: saved.period || "month",
        });
        this.firstName = (user.name || "").split(" ")[0];
        this.greeting = greeting();
        this.number = number;
        this.count = (v) => number(Math.round(v || 0));
        this.m = (v) => this.fmt.full(v);
        this.ms = (v) => this.fmt.short(v);
        onWillStart(async () => {
            const [canCreate] = await Promise.all([
                user.checkAccessRight("res.partner", "create").catch(() => false),
                this.load(),
            ]);
            this.state.canCreate = canCreate;
        });
    }

    async load() {
        const data = await loadDashboard(this, () => this.orm.call("res.partner", "customer_modern_dashboard", [this.state.period]));
        if (!data) {
            return;
        }
        this.fmt = moneyFormatters(data.currency_id, data.lakh);
        this.state.data = data;
    }

    onFilters(change) {
        Object.assign(this.state, change);
        try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify({ period: this.state.period }));
        } catch {
            // private mode: the choice is simply not remembered
        }
        return this.load();
    }

    // ---------- figures ----------
    shortDate(v) {
        return shortDate(v);
    }
    get caption() {
        return periodCaption(this.state.data.range, this.state.data.period);
    }
    get compare() {
        return compareWord(this.state.data.period);
    }
    get k() {
        return this.state.data.kpis;
    }
    get f() {
        return this.state.data.finance;
    }
    get ytd() {
        return this.state.data.months.filter((m) => !m.future).reduce((s, m) => s + m.value, 0);
    }
    get topCustomers() {
        return (this.state.data.sales?.top || []).map((c) => ({ ...c, partner: c.id, sub: `${c.orders} ${_t("orders")}` }));
    }
    get topVendors() {
        return (this.state.data.purchases?.top || []).map((v) => ({ ...v, partner: v.id }));
    }
    location(p) {
        return [p.city, p.country_id && p.country_id[1]].filter(Boolean).join(", ") || "—";
    }
    get debtors() {
        return (this.f?.debtors || []).map((d) => ({ ...d, partner: d.id, sub: `${d.count} ${_t("overdue invoices")}` }));
    }

    // ---------- navigation: Odoo's own lists and forms ----------
    openPartners(name, domain, context = {}) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "res.partner",
            views: [[false, "list"], [false, "kanban"], [false, "form"]],
            domain,
            context,
            target: "current",
        });
    }
    go(xmlid) {
        return this.action.doAction(xmlid);
    }
    newContact() {
        return openFullForm(this.action, "res.partner", false, { context: { default_is_company: true } });
    }
    openPartner(item) {
        return openFullForm(this.action, "res.partner", item.id);
    }
    openNew() {
        const [start] = this.state.data.range;
        return this.openPartners(_t("New contacts"), [["create_date", ">=", dayStart(start)]]);
    }
    openCountry(item) {
        return this.openPartners(item.label, [["country_id", "=", item.id]]);
    }
    openCity(item) {
        return this.openPartners(item.label, [["city", "=", item.label]]);
    }
    openTag(item) {
        return this.openPartners(item.label, [["category_id", "in", [item.id]]]);
    }
    openAttention(item) {
        switch (item.key) {
            case "no_email":
                return this.openPartners(item.label, [["email", "=", false], ["type", "=", "contact"]]);
            case "no_phone":
                return this.openPartners(item.label, [["phone", "=", false], ["type", "=", "contact"]]);
            case "activities":
                return this.openPartners(item.label, [["activity_state", "=", "overdue"]]);
            case "blacklisted":
                return this.openPartners(item.label, [["is_blacklisted", "=", true]]);
            case "overdue":
                return this.openOverdue(item.label);
        }
    }
    openOverdue(name) {
        if (!this.f) {
            return;
        }
        return this.action.doAction({
            type: "ir.actions.act_window",
            name,
            res_model: "account.move",
            views: [[false, "list"], [false, "form"]],
            domain: [
                ["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"],
                ["payment_state", "in", ["not_paid", "partial"]], ["invoice_date_due", "<", this.state.data.today],
            ],
            context: { default_move_type: "out_invoice" },
            target: "current",
        });
    }
}

registry.category("actions").add("customer_modern.dashboard", ContactsDashboard);
