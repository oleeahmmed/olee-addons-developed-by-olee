"""Modern Time Off: view ids of the pages (read-only, on Odoo's own hr.leave / hr.leave.allocation)."""
from odoo import api, models


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    @api.model
    def employee_modern_view_ids(self):
        ids = super().employee_modern_view_ids()

        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        leave = {
            'list': ref('hr_holidays.hr_leave_view_tree'),
            'kanban': ref('hr_holidays.hr_leave_view_kanban'),
            'calendar': ref('hr_holidays.hr_leave_view_calendar'),
            'activity': ref('hr_holidays.hr_leave_view_activity'),
            'pivot': ref('hr_holidays.view_holiday_pivot'),
            'graph': ref('hr_holidays.view_evaluation_report_graph'),
            'form': ref('hr_holidays.hr_leave_view_form_manager'),
            'search': ref('hr_holidays.hr_leave_view_search_manager'),
        }
        for view_type, view_id in leave.items():
            ids[f'leave_{view_type}'] = view_id
        ids.update({
            'alloc_list': ref('hr_holidays.hr_leave_allocation_view_tree'),
            'alloc_kanban': ref('hr_holidays.hr_leave_allocation_view_kanban'),
            'alloc_activity': ref('hr_holidays.hr_leave_allocation_view_activity'),
            'alloc_form': ref('hr_holidays.hr_leave_allocation_view_form_manager'),
            'alloc_search': ref('hr_holidays.hr_leave_allocation_view_search_manager'),
        })
        return ids
