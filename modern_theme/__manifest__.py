{
    "name": "Modern Theme",
    "summary": "Light/Dark mode and shadcn/ui-inspired color themes for the Odoo backend.",
    "version": "19.0.2.1.0",
    "category": "Themes/Backend",
    "author": "Olee",
    "license": "LGPL-3",
    "depends": ["web", "base_setup"],
    "data": [
        "views/webclient_templates.xml",
        "views/res_config_settings_views.xml",
    ],
    "assets": {
        "web.assets_web": [
            "modern_theme/static/src/scss/tokens.scss",
            "modern_theme/static/src/scss/overrides.scss",
            "modern_theme/static/src/scss/addon_bridges.scss",
            "modern_theme/static/src/scss/shell.scss",
            "modern_theme/static/src/scss/form.scss",
            "modern_theme/static/src/scss/sheet.scss",
            "modern_theme/static/src/scss/kanban.scss",
            "modern_theme/static/src/js/**/*",
            "modern_theme/static/src/xml/**/*",
        ],
        "web.assets_web_dark": [
            "modern_theme/static/src/scss/tokens.dark.scss",
            "modern_theme/static/src/scss/surfaces.dark.scss",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
