"""Modern Attendances: view ids of the pages (read-only, on Odoo's own hr.attendance)."""
from odoo import api, models


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    @api.model
    def employee_modern_view_ids(self):
        ids = super().employee_modern_view_ids()

        def ref(xmlid):
            record = self.env.ref(xmlid, raise_if_not_found=False)
            return record.id if record else False

        attendance = {
            'list': ref('hr_attendance.view_attendance_tree'),
            'kanban': ref('hr_attendance.view_hr_attendance_kanban'),
            'pivot': ref('hr_attendance.hr_attendance_view_pivot'),
            'graph': ref('hr_attendance.hr_attendance_view_graph'),
            'form': ref('hr_attendance.hr_attendance_view_form'),
            'search': ref('hr_attendance.hr_attendance_view_filter'),
        }
        for prefix in ('att', 'atwork'):
            for view_type, view_id in attendance.items():
                ids[f'{prefix}_{view_type}'] = view_id
        ids.update({
            'overtime_list': ref('hr_attendance.view_attendance_tree_management'),
            'overtime_pivot': ref('hr_attendance.hr_attendance_view_pivot'),
            'overtime_form': ref('hr_attendance.hr_attendance_view_form'),
            'overtime_search': ref('hr_attendance.hr_attendance_management_view_filter'),
        })
        return ids
