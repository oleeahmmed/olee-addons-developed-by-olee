# Modern CRM (`crm_modern`)

A modern SaaS-style workspace for Odoo 19 CRM. It adds no new tables and no app of
its own: it lives inside Odoo's **CRM** app and every screen reads and writes the
standard models. Navigation is drawn by **Modern Theme**'s global sidebar (three
styles, Ctrl+K search, pinned menus); CRM only tells it how to organise the CRM menu
(`static/src/js/sidebar/sidebar.js`).

## Inside the CRM app
* Menus are children of `crm.crm_menu_root`; the Dashboard comes first, so it is what
  CRM opens. Odoo's own CRM menus are untouched and all shown in the sidebar, merged into
  the matching group (Deals, Reporting, Configuration with sub-headings); menus other apps
  add to CRM appear as their own group. Team, Reporting and Configuration sit at the
  bottom of the sidebar, closed by default, so the everyday pages come first. Reporting links Odoo's Forecast, Pipeline, Leads
  and Activities analyses (CRM Simple hides Odoo's own Reporting menu).
* Rights are Odoo's: menu groups, record rules (own / all documents), access rights.
  Pages hide what the user may not do (New buttons, team editing) via
  `checkAccessRight`. Reads always run with the user's own rights; `sudo()` is only
  used to check login uniqueness and to set groups in the Users page (managers only).
* Setup ▸ Settings opens Odoo's CRM settings; Lost Reasons is Odoo's own list.
* Editing follows Odoo exactly: lists are Odoo's (select rows, then edit a cell to change
  them all: multi-edit), kanban card menus show Edit / Archive / Delete only when Odoo
  allows them, and the opportunity page checks the rights of that very record
  (`checkAccessRight` with record rules): without write access it is read-only (no stage
  change, no Won / Lost, no messages / activities / quotations), Delete only with unlink.

| Sidebar page | Odoo model(s) |
|---|---|
| Dashboard | `crm.lead` (aggregated with `_read_group`), `mail.activity`, `utm.campaign` |
| Pipeline (board + list, drag & drop) | `crm.lead` (type = opportunity), `crm.stage`; board cards from the standalone view `crm_modern.crm_lead_kanban_modern` |
| Leads (bulk assign / convert / lost) | `crm.lead` (type = lead), Odoo convert & lost wizards |
| Opportunity / lead page | `crm.lead`, `mail.activity`, Odoo's Chatter timeline; one compact tabbed card: Send message · Log note · Activity (quick scheduler) · extra tabs from other addons |
| Activities | `mail.activity`; schedule = `mail.activity.schedule` (activity plans included) |
| Campaigns (sales team, CSV upload) | `utm.campaign` + CRM Simple's `simple_team_id` |
| Salespeople / Sales Teams | `crm.team.member`, `crm.team`, `res.users`; team cards (view `crm_modern.crm_team_kanban_modern`) change the leader and salespeople in one click |
| Pipeline Stages | `crm.stage` (won, folded, stale-after days) |
| Activity Types / Activity Plans | `mail.activity.type`, `mail.activity.plan` |
| Tags | `crm.tag` (Odoo's 12 colors) |

Activity chaining (suggest / trigger next), "Done & schedule next" and activity plans
all run through Odoo's own `mail.activity` methods, so they behave exactly like the
standard CRM.

List pages (Pipeline, Leads, Activities, Campaigns, Salespeople, Sales Teams, configuration,
and the Quotations / Sales Orders pages of `crm_modern_sale`) use Odoo's own two-part layout,
full width: the control panel (New, title, search, pager, views) and the view below it.

## The "+ New" button in the sidebar
Under the search box, the sidebar shows one **+ New …** button. It creates the record
of the page you are on: **New opportunity** on Pipeline, **New lead** on Leads, **New
campaign** on Campaigns, **New tag** under Configuration ▸ Tags and so on. It only
appears when you are allowed to create (`checkAccessRight`). On phones the sidebar is
a drawer, so Odoo's own **New** button stays visible in lists and boards.

Counters: **Activities** shows your late + today activities, **Leads** the leads
without a salesperson. Ctrl+K finds opportunities, campaigns and quotations by name.

## Theme
Colours, fonts, radius, density and light/dark come from `modern_theme`
(**Settings ▸ Modern Theme**, or each user's **Appearance** menu). CRM's own tokens
(`--cm-*`) are aliases of the theme tokens, so any theme change restyles the CRM.

## Depends on
`modern_theme`, `crm`, `utm`, `mail`, `sales_team`.

## Design
Pages are scoped under `.o_cm` and only use theme tokens; standard Odoo views keep
Odoo's behaviour. The print preview and the grouped form header apply only inside the
modern apps (`html.mt-app-modern`), so Accounting / Inventory keep Odoo's own printing.

## Install / update
```
python odoo-bin -c odoo.conf -d <db> -i crm_modern --stop-after-init
python odoo-bin -c odoo.conf -d <db> -u crm_modern --stop-after-init
```

## CRM Settings ▸ Leads
Everything lead-related follows the standard setting (group `crm.group_use_lead`):
the Leads menu, the dashboard's lead figures, the campaign "Leads" column, CRM
Simple's upload "Add as Lead" option, and CSV import (leads are created as
opportunities when the setting is off).

## Staying safe across Odoo updates
* No template overrides of Odoo's web client in this addon: the sidebar belongs to
  Modern Theme and is configured through the `modern_theme.sidebar_apps` registry.
* The simplified "new lead" form is a separate primary view
  (`crm_modern.crm_lead_view_form_simple_create`) used by the Modern CRM pages only;
  Odoo's standard CRM form is untouched.
* One small, defensive JS patch (ControlPanel.switchView) that falls back to Odoo's
  own behaviour for every normal view.
* Only stable hooks in XML: client actions, menus, and one field-name view
  extension. All other screens are Odoo's own views, referenced by xml id with
  `raise_if_not_found=False`.
* Extension points for other addons: registries `crm_modern.record_tabs` (tabs of the
  record page's action card), `crm_modern.record_sections`, `crm_modern.dashboard_sections`,
  `crm_modern.menu_icons`.
* The pipeline card view is standalone (no `inherit_id` / xpath on Odoo's kanban).
  Closing dates turn amber within 7 days and red when late (open deals only).
* Automated checks — run after every Odoo update:
  ```
  odoo-bin -c odoo.conf -d <db> -u crm_modern --test-tags /crm_modern --stop-after-init
  ```
  They verify that every embedded view, field and method still exists.

## Sales (built in, switches on by itself)
When the Sales app is installed (with `sale_crm`, which Odoo installs automatically for
CRM + Sales), CRM Modern shows its sales parts; without Sales they stay hidden and nothing
depends on it:
* opportunity page: **Quotation** tab (quick quote: customer, products, Save draft /
  Create & send / Confirm order; Send, Confirm, Invoice, Print, Cancel on existing ones);
* Deals: **Quotations** and **Sales Orders** pages (hidden through
  `ir.ui.menu._load_menus_blacklist` when Sales is missing);
* dashboard: open quotations, orders this month, quote > order rate;
* team cards: invoiced this month vs target and number of sales orders.

The former bridge module `crm_modern_sale` is merged into this one (uninstall it first).


## Changes in 19.0.3.0.0
* Sidebar moved to Modern Theme (3 styles, Ctrl+K, pinned / recent menus, badges, mobile drawer).
* Fixed: "Open leads" from a campaign now shows that campaign's leads only.
* Fixed: editing Call / Email / To-Do from CRM no longer restricts them to CRM.
* Fixed: dashboard periods use the user's timezone (were 6 h off in Bangladesh).
* Fixed: dashboard shows the 8 best teams, not 8 arbitrary ones.
* Fixed: CSV import matches tags, salespeople and sources literally (`%` and `_` are no
  longer wildcards).
* Fixed: "Mark done" dialog stays usable after a server error.
* Fixed: Home "New leads" counts the last 30 days.
* Fixed: CRM Home is the login page for CRM users only.
* Fixed: team record rules now update on upgrade; the "Own Salesteam" rule that let
  lower access levels see more teams was removed; Sales team rules are added even
  when Sales is installed after CRM Modern.
* Fixed: print preview and grouped form header are limited to the modern apps; the
  standard CRM form is no longer modified.
* Removed the unused `static/src/legacy` folder.
