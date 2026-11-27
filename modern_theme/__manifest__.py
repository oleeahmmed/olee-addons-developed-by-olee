{
    "name": "Modern Theme",
    "summary": "Odoo 19 backend with one fixed shadcn/ui look: neutral palette, #fafafa sidebar, light/dark.",
    "description": """
Modern Theme turns the Odoo 19 backend into a clean shadcn/ui admin dashboard:

* One fixed design, copied from shadcn/ui defaults: neutral palette, white cards on a
  soft grey page, #fafafa sidebar with #efefef active rows, 10px controls, 14px cards,
  Inter with full Bengali fallback. There are no palette, font, radius or density options.
* A single global sidebar for every app (shadcn classic): pinned and recent menus,
  counters, keyboard navigation and a mobile drawer. An apps menu is always in the top bar.
* Ctrl+K command palette: apps, menus, records and a light/dark switch.
* Light and dark (shadcn dark palette), switched instantly without reloading.
* Login page rebuilt as the shadcn card; every Odoo form, list, kanban and dialog keeps
  its own features and behaviour.
    """,
    "version": "19.0.7.1.0",
    "category": "Themes/Backend",
    "author": "Olee",
    "license": "LGPL-3",
    "depends": ["web", "base_setup", "mail"],
    "data": [
        "views/webclient_templates.xml",
        "views/res_users_views.xml",
        "views/res_config_settings_views.xml",
    ],
    "assets": {
        "web.assets_web": [
            # Palette data + mixins first: the whole bundle is compiled in one pass.
            "modern_theme/static/src/scss/mt_maps.scss",
            "modern_theme/static/src/scss/fonts.scss",
            "modern_theme/static/src/scss/tokens.scss",
            "modern_theme/static/src/scss/color_themes.scss",
            "modern_theme/static/src/scss/bridge.scss",
            "modern_theme/static/src/scss/components.scss",
            "modern_theme/static/src/scss/views.scss",
            "modern_theme/static/src/scss/layout.scss",
            "modern_theme/static/src/scss/sidebar.scss",
            "modern_theme/static/src/scss/sidebar_shadcn.scss",
            "modern_theme/static/src/scss/icons.scss",
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
            "modern_theme/static/src/scss/shadcn.scss",
            "modern_theme/static/src/scss/shadcn_light.scss",
            "modern_theme/static/src/scss/list_shadcn.scss",
            "modern_theme/static/src/scss/settings_shadcn.scss",
            "modern_theme/static/src/scss/stat_strips.scss",
            "modern_theme/static/src/scss/calendar_shadcn.scss",
            "modern_theme/static/src/scss/record_header.scss",
            "modern_theme/static/src/scss/header_strips.scss",
            "modern_theme/static/src/scss/compact_form_head.scss",
            "modern_theme/static/src/scss/doc_sections.scss",
            "modern_theme/static/src/scss/doc_frames.scss",
            "modern_theme/static/src/scss/notebook_tabs.scss",
            "modern_theme/static/src/scss/doc_polish.scss",
            "modern_theme/static/src/scss/product_card.scss",
            "modern_theme/static/src/scss/product_kanban.scss",
            "modern_theme/static/src/scss/partner_kanban.scss",
            "modern_theme/static/src/scss/product_notes.scss",
            "modern_theme/static/src/scss/form_global.scss",
            "modern_theme/static/src/scss/chatter.scss",
            "modern_theme/static/src/scss/activity_dialog.scss",
            "modern_theme/static/src/scss/utilities.scss",
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
        # Every modern app of custom-addons ships NO stylesheet: all their styles live here,
        # in scss/apps/<app>.scss (light) and <app>.dark.scss (dark). Scoped by each app's
        # root class (.o_cm, .o_ss, .o_ps…), so an app that is not installed costs nothing.
        # POS: pos_modern and every shop addon of custom-addons/pos use apps/pos.scss.
        "web.assets_backend": [
            "modern_theme/static/src/scss/apps/crm.scss",
            "modern_theme/static/src/scss/apps/customer.scss",
            "modern_theme/static/src/scss/apps/employee.scss",
            "modern_theme/static/src/scss/apps/inventory.scss",
            "modern_theme/static/src/scss/apps/invoice.scss",
            "modern_theme/static/src/scss/apps/accounting.scss",
            "modern_theme/static/src/scss/apps/mrp.scss",
            "modern_theme/static/src/scss/apps/project.scss",
            "modern_theme/static/src/scss/apps/purchase.scss",
            "modern_theme/static/src/scss/apps/sales.scss",
            "modern_theme/static/src/scss/apps/pos.scss",
        ],
        "web.report_assets_common": [
            "modern_theme/static/src/scss/report_modern.scss",
            "modern_theme/static/src/scss/apps/pos_report.scss",
        ],
        "web.assets_backend_lazy": [
            "modern_theme/static/src/js/graph_colors.js",
        ],
        "web.assets_web_dark": [
            "modern_theme/static/src/scss/tokens.dark.scss",
            "modern_theme/static/src/scss/dark.scss",
            "modern_theme/static/src/scss/apps/crm.dark.scss",
            "modern_theme/static/src/scss/apps/customer.dark.scss",
            "modern_theme/static/src/scss/apps/employee.dark.scss",
            "modern_theme/static/src/scss/apps/inventory.dark.scss",
            "modern_theme/static/src/scss/apps/invoice.dark.scss",
            "modern_theme/static/src/scss/apps/accounting.dark.scss",
            "modern_theme/static/src/scss/apps/mrp.dark.scss",
            "modern_theme/static/src/scss/apps/project.dark.scss",
            "modern_theme/static/src/scss/apps/purchase.dark.scss",
            "modern_theme/static/src/scss/apps/sales.dark.scss",
            "modern_theme/static/src/scss/apps/pos.dark.scss",
        ],
        "web.assets_frontend": [
            "modern_theme/static/src/scss/mt_maps.scss",
            "modern_theme/static/src/scss/fonts.scss",
            "modern_theme/static/src/scss/tokens.scss",
            "modern_theme/static/src/scss/login.scss",
            "modern_theme/static/src/scss/apps/pos_frontend.scss",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
