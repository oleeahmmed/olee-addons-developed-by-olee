"""Modern Project: view ids of the pages.

Read-only, on Odoo's own project.project / project.task (no new table or field).
"""
from odoo import api, models


class ProjectTask(models.Model):
    _inherit = 'project.task'

    # ------------------------------------------------------------------
    # Views of the pages (by xml id; a missing one falls back to the model's
    # default view, so an Odoo update cannot break a page)
    # ------------------------------------------------------------------
    @api.model
    def project_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        task = {
            'list': ref('project.view_task_tree2'),
            'form': ref('project.view_task_form2'),
            'search': ref('project.view_task_search_form'),
            'calendar': ref('project.view_task_calendar'),
            'pivot': ref('project.view_project_task_pivot'),
            'graph': ref('project.view_project_task_graph'),
            'activity': ref('project.project_task_view_activity'),
        }
        ids = {}
        for prefix, kanban, extra in (
            ('board', 'project_modern.task_kanban_board', {}),
            ('mytask', 'project_modern.task_kanban_my', {'list': ref('project.open_view_my_tasks_list_view')}),
            ('alltask', 'project_modern.task_kanban_all', {'list': ref('project.open_view_all_tasks_list_view'),
                                                            'calendar': ref('project.view_task_all_calendar')}),
            ('overdue', 'project_modern.task_kanban_all', {'list': ref('project.open_view_all_tasks_list_view')}),
            ('unassigned', 'project_modern.task_kanban_all', {'list': ref('project.open_view_all_tasks_list_view')}),
            ('closed', 'project_modern.task_kanban_all', {'list': ref('project.open_view_all_tasks_list_view')}),
        ):
            views = {**task, 'kanban': ref(kanban), **{k: v for k, v in extra.items() if v}}
            for view_type, view_id in views.items():
                ids[f'{prefix}_{view_type}'] = view_id
        ids.update({
            'project_kanban': ref('project_modern.project_kanban'),
            'project_list': ref('project.view_project'),
            'project_form': ref('project.edit_project'),
            'project_search': ref('project.view_project_project_filter'),
            'project_calendar': ref('project.view_project_calendar'),
            'project_activity': ref('project.project_project_view_activity'),
            'stage_list': ref('project_modern.stage_list'),
            'stage_kanban': ref('project.view_project_task_type_kanban'),
            'stage_form': ref('project.task_type_edit'),
            'stage_search': ref('project.task_type_search'),
            'tag_list': ref('project_modern.tag_list'),
            'tag_form': ref('project.project_tags_form_view'),
            'tag_search': ref('project.project_tags_search_view'),
        })
        return ids
