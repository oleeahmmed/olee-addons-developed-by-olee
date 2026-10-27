{
    'name': 'Modern Project',
    'summary': "Modern look and a simple sidebar for Odoo's Project app: dashboard, projects, task boards by stage, my tasks, subtasks",
    'description': """
Modern Project gives Odoo's Project app the look of Modern CRM: a clean sidebar,
a top bar for what is used less, a dashboard, CRM-style task and project cards and
the CRM drawer for simple records.

Sidebar: Dashboard, Projects, My Tasks, All Tasks.
Top bar: More (overdue, unassigned and closed tasks), Reporting and Configuration
(task stages and tags open in the CRM-style drawer).

Everything runs on Odoo's own project.project / project.task / project.task.type /
project.tags: stages, kanban drag and drop, subtasks, timesheets, chatter, activities,
ratings and access rights stay Odoo's. No new table or field: only extra views
(standalone kanban cards) and pages, so an Odoo update cannot break the data.
    """,
    'version': '19.0.1.0.0',
    'category': 'Services/Project',
    'author': 'Olee',
    'license': 'LGPL-3',
    'depends': ['modern_theme', 'project', 'mail'],
    'data': [
        'views/project_modern_views.xml',
        'views/project_modern_actions.xml',
        'views/project_modern_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'project_modern/static/src/scss/app.scss',
            'project_modern/static/src/scss/cards.scss',
            'project_modern/static/src/js/app_context.js',
            'project_modern/static/src/js/drawer.js',
            'project_modern/static/src/js/pages.js',
            'project_modern/static/src/js/dashboard.js',
            'project_modern/static/src/js/sidebar.js',
            'project_modern/static/src/xml/drawer.xml',
            'project_modern/static/src/xml/dashboard.xml',
        ],
        'web.assets_web_dark': [
            'project_modern/static/src/scss/app.dark.scss',
        ],
    },
    'installable': True,
    'application': False,
}
