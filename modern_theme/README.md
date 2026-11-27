# Modern Theme (Odoo 19 Community)

The Odoo backend styled as shadcn/ui defaults: one fixed look (neutral palette,
Inter, 10px controls, 14px cards, `#fafafa` sidebar, inset content card on a grey
canvas) with a single light / dark switch. There are no theme options to choose
from — every company and user gets the same interface.

## Install / upgrade

```bash
# first install
python odoo-bin -c odoo.conf -d <db> -i modern_theme
# upgrade
python odoo-bin -c odoo.conf -d <db> -u modern_theme,crm_modern,sales_modern,inventory_modern,purchase_modern,mrp_modern
```

Then hard-refresh the browser (Ctrl+Shift+R) once.

## Appearance

| Who | Where | What |
|---|---|---|
| Every user | **Top bar > sun/moon icon** | Light / dark switch (no page reload). Remembered per browser in the `color_scheme` cookie. |

That is the whole appearance menu. The look, spacing and colours below are fixed
in the stylesheets.

## The sidebar

The sidebar lists only each app's everyday pages. The current app's less used menus go
to the **top bar**: Odoo's other groups under **More**, then **Reporting** and
**Configuration** (detected from the menu xml ids, so it works for any app). On phones
everything stays in the sidebar drawer. App icons drawn as a single white or black glyph
(Odoo 19's Discuss, Apps, Settings) get a neutral tile so they read in light and
dark mode.

An **apps menu** (grid icon) is always at the start of the top bar, on phones too:
it opens any app.

The sidebar itself is the shadcn/ui one (`scss/sidebar_shadcn.scss`): workspace header
(company logo and name), a search field with its Ctrl K shortcut, the current app's
everyday menus as one labelled group of 32px rows (16px Lucide icon + label),
collapsible items whose sub-items have no icons and hang on a hairline, counters on
the right, the user card in the footer. The toggle button sits in the top bar (like
shadcn's SidebarTrigger); collapsed, it becomes a 64px icon rail and groups open as
flyouts. It shares:

* **Ctrl+K** (or the search button): apps, menus with their path, pinned and recent
  menus, records (contacts, and whatever apps register), plus the light/dark switch.
  Odoo's own command palette is the "Odoo commands…" entry.
* **Pinned menus**: hover a menu and click the star. Pins are stored on the user, so
  they follow the user to any device. **Recent** menus are kept per browser.
* Counter badges, keyboard navigation (arrows, Left/Right to close/open groups, Esc),
  remembered collapse state, and a **drawer on phones** (burger button in the top bar).
* Apps without an icon get a generated one (initials on a stable color).
* No "+ New" in the sidebar: every page has exactly one "New" button, left of the
  page title (lists, kanban, forms), or top right on the CRM home page.
* Menus come from `ir.ui.menu`: Odoo's groups and installed modules decide what shows.

## Look: shadcn/ui neutral base (light and dark)

| Token | Light | Dark |
|---|---|---|
| page / canvas (`--mt-content-bg`) | `#f5f5f5` | `#0a0a0a` |
| card / popover | `#ffffff` | `#171717` |
| muted / secondary / accent | `#f5f5f5` | `#262626` |
| text / muted text | `#0a0a0a` / `#737373` | `#fafafa` / `#a1a1a1` |
| border / input | `#e5e5e5` / `#e5e5e5` | white 10% / white 15% |
| ring / focus | `#a1a1a1` | `#737373` |
| sidebar | `#fafafa`, text `#525252`, hover `#efefef` | `#171717`, text `#a1a1a1`, hover `#262626` |
| primary (buttons, active states) | `#171717` on `#fafafa` text | `#e5e5e5` on `#171717` text |
| status | success `#16a34a`, warning `#d97706`, danger `#ef4444`, info `#0284c7` | `#4ade80`, `#fbbf24`, `#ff6467`, `#38bdf8` |

Cards are flat: 1px border, 12–14px radius, no shadow. Popovers, dropdowns and
dialogs get one soft shadow. Controls are 36px tall with an 8–10px radius and a
3px grey focus ring. Lists are a rounded bordered card with a hairline under the
40px header row; forms are white cards inside a 14px-radius page frame. Menu and
chrome icons are Lucide line icons drawn over the Font Awesome names
(`scss/icons.scss`). The exact palette lives in `$mt-shadcn` (`scss/mt_maps.scss`).

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
registry.category("modern_theme.moved_menus").add("some.addon_menu", "other_app.menu_root");

// Records the Ctrl+K palette searches (name_search, read access checked first)
registry.category("modern_theme.palette_models").add("crm.lead", { label: "Opportunity", icon: "fa-handshake-o" });
```

## Kanban boards

One design for every kanban in every app (`scss/kanban.scss`): a plain canvas,
one soft lane per stage (sticky header in the same colour, count pill, full-width
progress bar, amount), cards with an even gap, colour tag as a left bar, ribbons
(Won/Lost) clipped to the card corner, dashed drop placeholder, quick-create and
folded lanes. Contact cards (`scss/partner_kanban.scss`) get a circular avatar and
a hairline footer with outline stat pills. Tokens: `--mt-board-bg`,
`--mt-board-dot`, `--mt-lane-bg`, `--mt-lane-border`, `--mt-lane-radius`,
`--mt-card-gap`, `--mt-kanban-card-radius`. App addons only style what is inside
their own cards.

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
`moneyFormatters` (৳ lakh / crore for BDT; `record()` formats one document in its own
currency) and `dayStart` (local midnight in UTC for datetime domains).

**Print** (`js/print/`): the form header "Print / Preview" menu and the print preview of
quotations, orders, purchase orders, invoices, transfers and manufacturing orders, for all
modern apps.

**Python** (`tools.py`): `local_midnight` (a date → the naive UTC datetime Odoo stores).
`ir.ui.menu._mt_menu_requirements()` hides a menu when the optional app it needs
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
* Font: `--mt-font-family` (Inter, with Hind Siliguri / Noto Sans Bengali fallbacks for
  Bangla text), `--mt-font-mono`.

The palette was checked for WCAG AA (4.5:1) text contrast, in light and dark mode.

## How it works (for developers)

* `models/theme_options.py` lists the fixed `data-mt-*` attribute values once; the
  server renders them on `<html>` (`webclient_templates.xml`) so the first paint is
  already right. Only `data-mt-scheme` (light/dark) varies, from the `color_scheme`
  cookie. Sidebar collapse and pin states also come from cookies for the same reason.
* `js/theme/theme_service.js` (`mt_theme` service) updates `data-mt-scheme` and swaps
  the light/dark CSS bundle without reloading.
* SCSS: `mt_maps.scss` (palette data), `tokens*.scss` (custom properties),
  `bridge.scss` (Bootstrap/Odoo variables), `components.scss`, `views.scss`,
  `layout.scss`, `sidebar_shadcn.scss`, `palette.scss`, `login.scss`.
  `workspace.scss`, `form.scss`, `kanban.scss`, `sheet.scss` and `legacy_shell.scss`
  style the modern app addons' own pages (scoped to `html.mt-app-modern`).

## Known limits

* The top bar never scrolls away: Odoo's layout keeps it outside the scrolling area.
* Charts re-read the theme colors the next time they render (not mid-animation).
