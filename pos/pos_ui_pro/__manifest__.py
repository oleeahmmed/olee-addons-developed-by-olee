{
    "name": "POS UI Pro — Shop & Restaurant",
    "version": "19.0.4.0.0",
    "category": "Sales/Point of Sale",
    "summary": "Pick your business in POS settings and get a clean one-screen POS made for it",
    "description": """
One "Business type" setting on each POS (Restaurant/Bar, Cafe, Fast food, Bakery,
Retail, Grocery, Fashion/Electronics, Pharmacy/Cosmetics) chooses the screen layout.
Restaurant also switches on Odoo's table service. Every button (new/hold, draft,
orders, refund, cash in/out, close session, send to kitchen, pay) runs Odoo's own
built-in POS action. No new models: three selection fields on pos.config (business type, POS style, theme colour).
Styles: modern_theme/static/src/scss/apps/pos_ui.scss.
""",
    "depends": ["point_of_sale", "modern_theme", "pos_modern"],
    "data": ["views/res_config_settings_views.xml"],
    "assets": {
        # The counter (pos_modern Menu page): colour + business data attributes.
        "web.assets_backend": [
            "pos_ui_pro/static/src/menu/**/*",
        ],
        "point_of_sale._assets_pos": [
            "pos_ui_pro/static/src/app/**/*",
            # All POS styling lives in modern_theme (shadcn tokens, light/dark, colour themes).
            "modern_theme/static/src/scss/apps/pos_ui.scss",
        ],
    },
    "installable": True,
    "license": "LGPL-3",
}
