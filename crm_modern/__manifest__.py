{
    'name': 'CRM Modern',
    'summary': 'A modern, sidebar-driven CRM workspace built on the standard Odoo CRM models',
    'description': """
Modern CRM gives Odoo CRM a clean, shadcn-style interface with a left sidebar:
dashboard, pipeline board, leads, activities, campaigns, salespeople, sales teams,
stages, activity types, activity plans and tags.

No new tables: everything reads and writes the standard models
(crm.lead, crm.stage, crm.team, utm.campaign, crm.tag, mail.activity,
mail.activity.type, mail.activity.plan). Campaigns store a default sales
team (crm_modern_team_id) so empty campaigns remember who owns uploaded leads.
    """,
    'version': '19.0.2.7.0',
    'category': 'Sales/CRM',
    'author': 'Your Name',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'crm', 'utm', 'mail', 'sales_team'],
    'data': [
        'views/report_layout.xml',
        'views/crm_modern_lead_views.xml',
        'views/crm_modern_campaign_views.xml',
        'views/crm_modern_team_views.xml',
        'views/crm_modern_actions.xml',
        'views/crm_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'crm_modern/static/src/scss/tokens.scss',
            'crm_modern/static/src/scss/pages.scss',
            'crm_modern/static/src/scss/record.scss',
            'crm_modern/static/src/scss/list.scss',
            'crm_modern/static/src/scss/sale.scss',
            'crm_modern/static/src/scss/print.scss',
            'crm_modern/static/src/scss/dash.scss',
            'crm_modern/static/src/js/core/*.js',
            'crm_modern/static/src/js/components/*.js',
            'crm_modern/static/src/js/sidebar/*.js',
            'crm_modern/static/src/js/dash/*.js',
            'crm_modern/static/src/js/pages/*.js',
            'crm_modern/static/src/js/sale/*.js',
            'crm_modern/static/src/js/print/*.js',
            'crm_modern/static/src/xml/*.xml',
        ],
        'web.report_assets_common': [
            'crm_modern/static/src/scss/report_modern.scss',
        ],
        'web.assets_web_dark': [
            'crm_modern/static/src/scss/tokens.dark.scss',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'installable': True,
    'application': False,
}
