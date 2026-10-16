import { Component, onWillStart, useRef, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

const MAX_BYTES = 5 * 1024 * 1024;

/** RFC 4180-ish parser: quotes, escaped quotes, CRLF, comma or semicolon. */
export function parseCsv(text) {
    const src = text.replace(/^﻿/, "");
    const first = src.split(/\r?\n/, 1)[0] || "";
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
            if (c === '"' && src[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                quoted = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            quoted = true;
        } else if (c === delim) {
            row.push(field);
            field = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && src[i + 1] === "\n") {
                i++;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += c;
        }
    }
    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const toCsv = (rows) =>
    rows.map((r) => r.map((v) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");

const COMMON = [
    { key: "company", label: _t("Company"), aliases: ["company", "companyname", "organization", "organisation", "account", "partner", "customer"] },
    { key: "email", label: _t("Email"), aliases: ["email", "emailaddress", "mail", "emailfrom"] },
    { key: "phone", label: _t("Phone"), aliases: ["phone", "mobile", "telephone", "tel", "phonenumber", "mobileno", "phoneno"] },
    { key: "expected_revenue", label: _t("Expected revenue"), aliases: ["expectedrevenue", "revenue", "amount", "value", "dealvalue"] },
    { key: "tags", label: _t("Tags"), aliases: ["tags", "tag", "labels"] },
    { key: "salesperson", label: _t("Salesperson (name / login)"), aliases: ["salesperson", "owner", "user", "assignedto"] },
    { key: "note", label: _t("Notes"), aliases: ["note", "notes", "description", "remarks", "comment"] },
];

export const FIELDS = {
    lead: [
        { key: "name", label: _t("Lead / contact name"), required: true, aliases: ["name", "contactname", "contact", "fullname", "lead", "leadname"] },
        ...COMMON,
        { key: "source", label: _t("Source"), aliases: ["source", "leadsource", "origin"] },
        { key: "priority", label: _t("Priority (0–3)"), aliases: ["priority", "stars"] },
    ],
    opportunity: [
        { key: "name", label: _t("Opportunity"), required: true, aliases: ["opportunity", "opportunityname", "name", "deal", "dealname", "title"] },
        ...COMMON,
        { key: "contact", label: _t("Contact name"), aliases: ["contact", "contactname", "person", "fullname"] },
        { key: "stage", label: _t("Stage"), aliases: ["stage", "pipelinestage", "status"] },
        { key: "probability", label: _t("Probability (%)"), aliases: ["probability", "prob", "winprobability"] },
        { key: "date_deadline", label: _t("Expected closing"), aliases: ["closedate", "expectedclosing", "deadline", "datedeadline", "closingdate"] },
        { key: "priority", label: _t("Priority (0–3)"), aliases: ["priority", "stars"] },
    ],
};

const TEMPLATES = {
    lead: [
        ["Name", "Company", "Email", "Phone", "Source", "Expected revenue", "Tags", "Salesperson", "Notes"],
        ["Rahim Uddin", "Green Leaf Agro", "rahim@greenleaf.com", "+880 1711-555001", "Webinar", "25000", "Hot lead;ERP", "", "Asked for a demo"],
        ["Emma Collins", "Brightside Retail", "emma@brightside.co.uk", "+44 7700 900200", "LinkedIn", "18000", "POS", "", ""],
    ],
    opportunity: [
        ["Opportunity", "Company", "Contact", "Email", "Phone", "Expected revenue", "Stage", "Probability", "Expected closing", "Priority", "Tags", "Salesperson"],
        ["ERP for 3 factories", "Delta Steel", "Kamal Hossain", "kamal@deltasteel.com", "+880 1711-555002", "90000", "Qualified", "35", "2026-12-15", "2", "ERP", ""],
        ["POS for 12 stores", "Urban Mart", "Lisa Wong", "lisa@urbanmart.sg", "+65 8123 0000", "32000", "New", "", "2027-01-10", "1", "POS", ""],
    ],
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMap(headers, kind) {
    const used = new Set();
    return headers.map((h) => {
        const n = norm(h);
        const f = FIELDS[kind].find((x) => !used.has(x.key) && (x.aliases.includes(n) || norm(x.label) === n));
        if (!f) {
            return "";
        }
        used.add(f.key);
        return f.key;
    });
}

/** Upload a CSV of leads or opportunities into a campaign (crm.lead.crm_modern_import). */
export class ImportDialog extends Component {
    static template = "crm_modern.ImportDialog";
    static components = { Dialog };
    static props = {
        close: Function,
        campaign: Object, // { id, title, team? [id, name] }
        onImported: Function,
    };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.fileInput = useRef("file");
        this.state = useState({
            kind: "lead",
            teamId: this.props.campaign.team ? this.props.campaign.team[0] : "",
            assign: "round_robin",
            teams: [],
            members: {},
            file: null, // { name, headers, rows }
            mapping: [],
            error: null,
            over: false,
            busy: false,
        });
        onWillStart(async () => {
            const [teams, members] = await Promise.all([
                this.orm.searchRead("crm.team", [], ["name"], { order: "sequence, name" }),
                this.orm.searchRead("crm.team.member", [], ["crm_team_id"]),
            ]);
            this.state.teams = teams;
            for (const m of members) {
                const t = m.crm_team_id && m.crm_team_id[0];
                this.state.members[t] = (this.state.members[t] || 0) + 1;
            }
        });
    }

    get fields() {
        return FIELDS[this.state.kind];
    }
    get missing() {
        return this.fields.filter((f) => f.required && !this.state.mapping.includes(f.key));
    }
    get mappedFields() {
        return this.fields.filter((f) => this.state.mapping.includes(f.key));
    }
    get rows() {
        if (!this.state.file) {
            return [];
        }
        return this.state.file.rows.map((cells) => {
            const row = {};
            this.state.mapping.forEach((key, i) => {
                if (key) {
                    row[key] = (cells[i] || "").trim();
                }
            });
            const errors = [];
            for (const f of this.fields) {
                if (f.required && !row[f.key]) {
                    errors.push(_t("%s is empty", f.label));
                }
            }
            if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) {
                errors.push(_t("Invalid email"));
            }
            return { row, errors };
        });
    }
    get valid() {
        return this.rows.filter((r) => !r.errors.length);
    }
    get teamMembers() {
        return this.state.members[Number(this.state.teamId)] || 0;
    }

    setKind(kind) {
        this.state.kind = kind;
        if (this.state.file) {
            this.state.mapping = autoMap(this.state.file.headers, kind);
        }
    }

    setMapping(index, key) {
        this.state.mapping = this.state.mapping.map((v, j) => (j === index ? key : v === key && key ? "" : v));
    }

    async readFile(file) {
        this.state.error = null;
        if (!file) {
            return;
        }
        if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
            this.state.error = _t("Please choose a .csv file (save Excel sheets as CSV UTF-8).");
            return;
        }
        if (file.size > MAX_BYTES) {
            this.state.error = _t("The file is larger than 5 MB.");
            return;
        }
        const rows = parseCsv(await file.text());
        if (rows.length < 2) {
            this.state.error = _t("The file needs a header row and at least one data row.");
            return;
        }
        const [headers, ...data] = rows;
        this.state.file = { name: file.name, headers, rows: data };
        this.state.mapping = autoMap(headers, this.state.kind);
    }

    onPick(ev) {
        this.readFile(ev.target.files?.[0]);
        ev.target.value = "";
    }
    onDrop(ev) {
        this.state.over = false;
        this.readFile(ev.dataTransfer.files?.[0]);
    }

    downloadTemplate() {
        const blob = new Blob([toCsv(TEMPLATES[this.state.kind])], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${this.state.kind === "lead" ? "leads" : "opportunities"}_template.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async runImport() {
        const valid = this.valid;
        if (!valid.length || this.missing.length) {
            return;
        }
        this.state.busy = true;
        try {
            const res = await this.orm.call("crm.lead", "crm_modern_import", [
                this.state.kind,
                valid.map((v) => v.row),
                this.props.campaign.id,
                Number(this.state.teamId) || false,
                this.state.assign,
            ]);
            const skipped = this.rows.length - valid.length + res.duplicates + res.invalid;
            this.notification.add(
                skipped
                    ? _t("%(created)s imported, %(skipped)s skipped (invalid or duplicate).", { created: res.created, skipped })
                    : _t("%s records imported.", res.created),
                { type: "success", title: this.props.campaign.title }
            );
            this.props.onImported();
            this.props.close();
        } finally {
            this.state.busy = false;
        }
    }
}
