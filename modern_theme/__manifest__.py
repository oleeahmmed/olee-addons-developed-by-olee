{
    "name": "Modern Theme",
    "summary": "Premium backend theme for Odoo 19: design tokens, light/dark/auto, 3 sidebar styles, Ctrl+K search, live settings.",
    "description": """
Modern Theme turns the Odoo 19 backend into a clean admin dashboard:

* One global sidebar for every app, in three styles (classic tree, icon rail + panel,
  floating glass), with pinned and recent menus, counters, keyboard navigation and a
  mobile drawer.
* Ctrl+K command palette: apps, menus, records and quick theme actions.
* Light, dark and auto (follow the system) modes, switched instantly without reloading.
* 17 contrast-checked palettes (WCAG AA) or your own brand colour, 9 fonts with full
  Bengali support (self-hosted), 5 radius levels, 3 densities, border and shadow levels,
  top bar, content and list/form styles, 3 login page styles.
* Company defaults in Settings > Modern Theme (live preview, JSON export/import, reset)
  and a personal override for every user (Appearance menu).
    """,
    "version": "19.0.3.3.0",
    "category": "Themes/Backend",
    "author": "Olee",
    "license": "LGPL-3",
    "depends": ["web", "base_setup"],
    "data": [
        "views/webclient_templates.xml",
        "views/res_config_settings_views.xml",
        "views/res_users_views.xml",
    ],
    "assets": {
        "web.assets_web": [
            # Palette data + mixins first: the whole bundle is compiled in one pass.
            "modern_theme/static/src/scss/mt_maps.scss",
            "modern_theme/static/src/scss/fonts.scss",
            "modern_theme/static/src/scss/tokens.scss",
            "modern_theme/static/src/scss/bridge.scss",
            "modern_theme/static/src/scss/components.scss",
            "modern_theme/static/src/scss/views.scss",
            "modern_theme/static/src/scss/layout.scss",
            "modern_theme/static/src/scss/sidebar.scss",
            "modern_theme/static/src/scss/palette.scss",
            "modern_theme/static/src/scss/settings_ui.scss",
            # Modern app addons (crm / sales / inventory / purchase / mrp)
            "modern_theme/static/src/scss/workspace.scss",
            "modern_theme/static/src/scss/addon_bridges.scss",
            "modern_theme/static/src/scss/legacy_shell.scss",
            "modern_theme/static/src/scss/form.scss",
            "modern_theme/static/src/scss/kanban.scss",
            "modern_theme/static/src/scss/sheet.scss",
            "modern_theme/static/src/scss/print.scss",
            "modern_theme/static/src/js/**/*",
            "modern_theme/static/src/xml/**/*",
            ("remove", "modern_theme/static/src/js/graph_colors.js"),
        ],
        # Shared SCSS mixins (the app kit used by crm/sales/inventory/purchase/mrp _modern).
        # Helpers are prepended to every backend, dark and report bundle and emit no CSS
        # themselves, so app addons can @include them whatever the asset order.
        "web._assets_backend_helpers": [
            "modern_theme/static/src/scss/kit/*.scss",
        ],
        "web.report_assets_common": [
            "modern_theme/static/src/scss/report_modern.scss",
        ],
        "web.assets_backend_lazy": [
            "modern_theme/static/src/js/graph_colors.js",
        ],
        "web.assets_web_dark": [
            "modern_theme/static/src/scss/tokens.dark.scss",
            "modern_theme/static/src/scss/dark.scss",
        ],
        "web.assets_frontend": [
            "modern_theme/static/src/scss/mt_maps.scss",
            "modern_theme/static/src/scss/fonts.scss",
            "modern_theme/static/src/scss/tokens.scss",
            "modern_theme/static/src/scss/login.scss",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
