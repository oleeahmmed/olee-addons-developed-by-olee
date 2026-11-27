"""Modern Employees: view ids of the pages of the Employees app.

Read-only, on Odoo's own hr.employee / hr.department / hr.job (no new table or field).
"""
from odoo import api, models


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    # ------------------------------------------------------------------
    # Standard views shown in the pages (by xml id; a missing one falls
    # back to the model's default view, so an Odoo update cannot break a page)
    # ------------------------------------------------------------------
    @api.model
    def employee_modern_view_ids(self):
        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        employee = {
            'kanban': ref('hr.hr_kanban_view_employees'),
            'list': ref('hr.view_employee_tree'),
            'form': ref('hr.view_employee_form'),
            'search': ref('hr.view_employee_filter'),
            'activity': ref('hr.hr_employee_view_activity'),
            'graph': ref('hr.hr_employee_view_graph'),
            'pivot': ref('hr.hr_employee_view_pivot'),
        }
        ids = {}
        for prefix in ('employee', 'newhire', 'former', 'ending'):
            for view_type, view_id in employee.items():
                ids[f'{prefix}_{view_type}'] = view_id
        ids.update({
            'department_kanban': ref('hr.hr_department_view_kanban'),
            'department_list': ref('hr.view_department_tree'),
            'department_form': ref('hr.view_department_form'),
            'department_search': ref('hr.view_department_filter'),
            'job_list': ref('hr.view_hr_job_tree'),
            'job_kanban': ref('hr.hr_job_view_kanban'),
            'job_form': ref('hr.view_hr_job_form'),
            'job_search': ref('hr.view_job_filter'),
            'record_list': ref('hr.hr_version_list_view'),
            'record_pivot': ref('hr.hr_version_pivot_view'),
            'record_graph': ref('hr.hr_version_graph_view'),
            'record_search': ref('hr.hr_version_search_view'),
        })
        return ids
