# Modern Theme (Odoo 19 Community)

A token-based backend theme: one global sidebar in three styles, Ctrl+K search,
light / dark / auto modes, and more than 20 design options. Every option can be set
company-wide in Settings and overridden by each user.

## Install / upgrade

```bash
# first install
python odoo-bin -c odoo.conf -d <db> -i modern_theme
# upgrade (3.x migrates the 2.x preset and dark-mode settings automatically)
python odoo-bin -c odoo.conf -d <db> -u modern_theme,crm_modern,sales_modern,inventory_modern,purchase_modern,mrp_modern
```

Then hard-refresh the browser (Ctrl+Shift+R) once.

## Where to configure

| Who | Where | What |
|---|---|---|
| Administrator | **Settings > Modern Theme** | Company defaults for every option, with a live preview. Also: export / import a preset (JSON) and reset to factory defaults. Save applies them for everyone. |
| Every user | **Top bar > paint-brush icon**, or **user menu > Appearance**, or **Ctrl+K > "My appearance…"** | Personal overrides. Each option shows "Company default" until the user changes it; "Use default" goes back. |
| Every user | **Top bar > sun/moon icon** | One-click light/dark switch (no page reload). |

## Options

| Group | Option | Values |
|---|---|---|
| Colors | Color mode | Light, Dark, Auto (follows the operating system, live) |
| | Brand color | Indigo, Blue, Sky, Teal, Emerald, Green, Amber, Yellow, Orange, Red, Rose, Violet, Slate, Zinc, Stone, Gray, Neutral, or a custom hex color (text color on it is computed for contrast) |
| | Accent color | Optional second color for active markers and the "+ New" button |
| Typography | Font | Inter, Poppins, Roboto, Nunito, DM Sans, Plus Jakarta Sans, Hind Siliguri, Noto Sans Bengali, System. Bengali text always uses a Bengali font. All fonts are bundled (no internet needed). |
| | Text size | Small, Normal, Large (scales text, spacing and controls together) |
| Shape | Corner radius | None, Small, Medium, Large, Pill |
| | Density | Compact, Comfortable, Spacious |
| | Borders | None, Subtle, Normal, Strong |
| | Card shadow | None, Soft, Medium, Strong |
| Navigation | Sidebar style | Classic tree, Icon rail + panel, Floating glass |
| | Sidebar background | Solid, Brand tint, Gradient, Glass |
| | Sidebar width | Narrow, Normal, Wide |
| | Start collapsed | On / Off (each browser remembers the user's own choice) |
| | Top bar | Solid, Blend with canvas, Floating card |
| | Top bar height | Compact, Normal, Tall |
| Content | Content width | Full, Boxed (90rem max) |
| | Content frame | Rounded card on a canvas, Flat |
| | Lists | Clean, Striped, Bordered |
| | Forms | Classic, Card sections |
| | Animations | On / Off (the OS "reduce motion" setting always wins) |
| Login | Style | Split screen, Centered card, Minimal |
| | Background picture, tagline | Shown on the login page |

## The sidebar

The sidebar lists only each app's everyday pages. The current app's less used menus go
to the **top bar**: Odoo's other groups under **More**, then **Reporting** and
**Configuration** (detected from the menu xml ids, so it works for any app). On phones
everything stays in the sidebar drawer. App icons drawn as a single white or black glyph
(Odoo 19's Discuss, Apps, Settings) get a brand-coloured tile so they read in light and
dark mode.

* **Classic tree**: every app is an accordion row; the current app is open, with
  nested menus, indent guide lines and an active bar. Collapsed, it becomes an
  icon rail with hover flyouts.
* **Icon rail + panel**: apps as a rail of icons (with labels); the current app's menu
  sits in a docked panel. Unpin the panel and it shows as a flyout on hover.
* **Floating glass**: a floating rounded card with an app switcher (grid), titled
  sections and pill-shaped items. Collapsed, it shows mini icons with popovers.

All three share:
* **Ctrl+K** (or the search button): apps, menus with their path, pinned and recent
  menus, records (contacts, and whatever apps register), plus theme actions. Odoo's
  own command palette is the "Odoo commands…" entry.
* **Pinned menus**: hover a menu and click the star. Pins are stored on the user, so
  they follow the user to any device. **Recent** menus are kept per browser.
* Counter badges, keyboard navigation (arrows, Left/Right to close/open groups, Esc),
  remembered collapse state, and a **drawer on phones** (burger button in the top bar).
* Apps without an icon get a generated one (initials on a stable color).
* No "+ New" in the sidebar: every page has exactly one "New" button, left of the
  page title (lists, kanban, forms), or top right on home pages and dashboards.
* Menus come from `ir.ui.menu`: Odoo's groups and installed modules decide what shows.

## Look: the "Once" preset (default)

Inspired by Once UI: pure neutral greys (light `#f6f6f6` canvas / white cards, dark
`#0a0a0a` canvas / `#151515` cards), emerald brand for accents and links, and
high-contrast solid buttons (black in light mode, white in dark mode) through the
`--mt-solid`, `--mt-solid-fg`, `--mt-solid-hover` tokens. Menu and chrome icons are
Lucide line icons drawn over the Font Awesome names (`scss/icons.scss`).

## Sidebar API (for app addons)

```js
import { registry } from "@web/core/registry";

registry.category("modern_theme.sidebar_apps").add("crm.crm_menu_root", {
    legacyPrefix: "cm",                  // adds html.mt-app-modern + a hidden .o_cm_sidebar marker
    ownPrefixes: ["crm_modern."],        // the addon's own top-level menus
    mergeInto: { "crm.crm_menu_report": "crm_modern.menu_reporting" },
    replaced: new Set(["crm.menu_crm_opportunities"]),   // Odoo menus to hide
    secondary: new Set(["crm_modern.menu_config"]),      // whole groups shown in the top bar
    topbar: new Set(["crm_modern.menu_campaigns"]),      // single less-used pages: top bar "More"
    order: ["crm_modern.menu_home", "crm_modern.menu_marketing"],
    childOrder: { "crm_modern.menu_marketing": ["crm_modern.menu_leads"] },
    icons: registry.category("crm_modern.menu_icons"), // or a plain object xmlid -> "fa-…"
    createTargets: registry.category("crm_modern.create_targets"), // optional, kept for compatibility
    defaultCreate: "crm_modern.menu_pipeline",
    onCreate: async (spec, env) => false,
});

// Counter next to a menu (refreshed when the app opens, at most once a minute)
registry.category("modern_theme.menu_badges").add("crm_modern.menu_activities",
    (env) => env.services.orm.searchCount("mail.activity", [/* … */]));

// An Odoo menu another app now shows: hidden from every other app while that app is visible
registry.category("modern_theme.moved_menus").add("account.menu_finance_entries", "modern_accounting.menu_root");

// Records the Ctrl+K palette searches (name_search, read access checked first)
registry.category("modern_theme.palette_models").add("crm.lead", { label: "Opportunity", icon: "fa-handshake-o" });
```

## Home pages

```js
registerModernHome("sales_modern.home", {
    title: _t("Sales"),
    cards: [/* shortcut cards */],
    create: { resModel: "sale.order", label: _t("New quotation") }, // the page's "+ New" button
});
```

## Kanban boards

One design for every kanban in every app (`scss/kanban.scss`): dotted board, one
soft lane per stage (sticky header in the same colour, count pill, full-width
progress bar, amount), cards with an even gap, colour tag as a left bar, ribbons
(Won/Lost) clipped to the card corner, dashed drop placeholder, quick-create and
folded lanes. It follows the theme options (radius, density, borders, shadow,
light/dark). Tokens: `--mt-board-bg`, `--mt-board-dot`, `--mt-lane-bg`,
`--mt-lane-border`, `--mt-lane-radius`, `--mt-card-gap`, `--mt-kanban-card-radius`.
App addons only style what is inside their own cards.

## App kit (shared by the modern app addons)

`scss/kit/` holds SCSS mixins (loaded in `web._assets_backend_helpers`, so they emit no
CSS by themselves and are available in every backend, dark and report bundle). An app
addon passes its prefix and gets the full page kit:

```scss
// sales_modern/static/src/scss/app.scss
@include mt-app-tokens(ss);    // --ss-* tokens (re-mapped to the theme by addon_bridges.scss)
@include mt-app-pages(ss);     // .o_ss pages, embedded Odoo views, chatter, dialogs
@include mt-app-list(ss);
@include mt-app-controls(ss);
@include mt-app-helpers(ss);
@include mt-app-dash(ss);      // dashboards: KPI tiles, chart cards, ranked lists
// app.dark.scss (web.assets_web_dark)
@include mt-app-tokens-dark(ss);
```

Sales (`ss`), Inventory (`im`), Purchase (`mp`), Manufacturing (`mr`), Contacts (`cu`)
and Invoicing (`iv`) use it; CRM keeps its own richer page styles but shares the kanban,
forms, lists and tokens. A new app prefix is added once to `$mt-addon-prefixes`
(`addon_bridges.scss`) and to the `@each` list of `workspace.scss`. Printed documents of all
modern apps use one stylesheet: `scss/report_modern.scss`.

**JS kit** (`js/app_kit/`): `ListPage` (one page = Odoo's own control panel and views,
subclasses only give model, view ids, domain and context), `loadViewIds`, `openFullForm`,
the dashboard components `OD_COMPONENTS` (KPI tile, combo chart, donut, ranked list,
attention list, ageing bar, period filter, error card), `loadDashboard` (latest request
wins, error card instead of a crash), `moneyFormatters` (৳ lakh / crore for BDT; `record()`
formats one document in its own currency) and `dayStart` (local midnight in UTC for
datetime domains).

**Print** (`js/print/`): the form header "Print / Preview" menu and the print preview of
quotations, orders, purchase orders, invoices, transfers and manufacturing orders, for all
modern apps.

**Python** (`tools.py`): `local_midnight`, `period_bounds`, `growth`, `month_key` for the
dashboards. `ir.ui.menu._mt_menu_requirements()` hides a menu when the optional app it needs
is not installed:

```python
def _mt_menu_requirements(self):
    res = super()._mt_menu_requirements()
    res['customer_modern.menu_customers'] = 'customer_rank' in self.env['res.partner']._fields
    return res
```

## Design tokens

Components only use CSS custom properties. The main ones:

* Palette: `--mt-background`, `--mt-foreground`, `--mt-card`, `--mt-muted`, `--mt-muted-foreground`,
  `--mt-primary`, `--mt-primary-foreground`, `--mt-primary-text` (primary as readable text),
  `--mt-primary-soft`, `--mt-border` / `--mt-border-base`, `--mt-input`, `--mt-ring`,
  `--mt-success|warning|destructive|info` and their `-soft` versions, `--mt-content-bg`
  (canvas), `--mt-popover`, `--mt-hover`, `--mt-selected`.
* Shape and size: `--mt-radius-xs|sm|lg`, `--mt-radius`, `--mt-radius-card|control|btn|badge|field`,
  `--mt-control-h`, `--mt-btn-h`, `--mt-row-py`, `--mt-pad`, `--mt-gap`, `--mt-card-pad`,
  `--mt-field-gap`, `--mt-sb-item-h`, `--mt-topbar-h`, `--mt-sb-w`.
* Elevation: `--mt-shadow-xs|sm|md|lg|xl`, `--mt-card-shadow`, `--mt-card-shadow-hover`.
* Sidebar: `--mt-sidebar-bg|bg-image|fg|muted-fg|accent|active-bg|active-fg|indicator|border|guide|blur`.
* Font: `--mt-font-family`, `--mt-font-mono`.

Every palette was checked for WCAG AA (4.5:1) text contrast, in light and dark mode.

## How it works (for developers)

* `models/theme_options.py` lists every option once; `res.company` holds the
  defaults, `res.users` holds personal overrides (empty = follow the company).
* The server renders the effective values as `data-mt-*` attributes on `<html>`
  (`webclient_templates.xml`) and picks the light or dark CSS bundle, so the first paint
  is already right. Sidebar collapse and pin states come from cookies for the same reason.
* `js/theme/theme_service.js` (`mt_theme` service) updates those attributes live,
  swaps the CSS bundle for light/dark without reloading, and follows the OS in auto mode.
* SCSS: `mt_maps.scss` (palette data), `tokens*.scss` (custom properties),
  `bridge.scss` (Bootstrap/Odoo variables), `components.scss`, `views.scss`,
  `layout.scss`, `sidebar.scss`, `palette.scss`, `settings_ui.scss`, `login.scss`.
  `workspace.scss`, `form.scss`, `kanban.scss`, `sheet.scss` and `legacy_shell.scss`
  style the modern app addons' own pages (scoped to `html.mt-app-modern`).

## Known limits

* The top bar never scrolls away: Odoo's layout keeps it outside the scrolling area.
  "Top bar style" is therefore Solid / Blend / Floating rather than Sticky / Static.
* "Floating labels" were not added as a global form style: they would break many
  Odoo widgets (many2one, tags, monetary…). The modern app addons keep their own
  labelled field boxes.
* Charts re-read the theme colors the next time they render (not mid-animation).
