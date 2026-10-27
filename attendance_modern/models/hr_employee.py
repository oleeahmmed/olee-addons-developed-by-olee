"""Modern Attendances: the Attendance dashboard (read-only, on Odoo's own hr.attendance)."""
from datetime import timedelta

from odoo import api, models
from odoo.addons.employee_modern.models.hr_employee import _json_domain, _safe
from odoo.addons.modern_theme.tools import growth
from odoo.tools import date_utils


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

    # ------------------------------------------------------------------
    # Attendances
    # ------------------------------------------------------------------
    @api.model
    def attendance_modern_dashboard(self, period='month', department_id=False):
        if 'hr.attendance' not in self.env:
            return {'installed': False}
        head = self._employee_modern_head(period, department_id)
        today, at = head['today'], head['midnight']
        start, end, prev_start, prev_end = head['bounds']
        Attendance = self.env['hr.attendance']
        scope = [('employee_id.company_id', 'in', self.env.companies.ids)]
        employee_scope = [('company_id', 'in', self.env.companies.ids)]
        if department_id:
            scope.append(('employee_id.department_id', 'child_of', department_id))
            employee_scope.append(('department_id', 'child_of', department_id))

        def within(a, b):
            return [('check_in', '>=', at(a)), ('check_in', '<', at(b))]

        hours = self._employee_modern_try(lambda: self._employee_modern_sum(Attendance, scope + within(start, end), 'worked_hours'), 0.0)
        hours_prev = self._employee_modern_try(
            lambda: self._employee_modern_sum(Attendance, scope + within(prev_start, prev_end), 'worked_hours'), 0.0)
        overtime = self._employee_modern_try(
            lambda: self._employee_modern_sum(Attendance, scope + within(start, end), 'overtime_hours'), 0.0)
        headcount = self.search_count(employee_scope)
        checked_today = self._employee_modern_try(lambda: len(Attendance._read_group(
            scope + within(today, today + timedelta(days=1)), ['employee_id'])), 0)
        worked_days = self._employee_modern_try(lambda: len(Attendance._read_group(
            scope + within(start, end), ['employee_id', 'check_in:day'])), 0)

        kpis = {
            'at_work': self._employee_modern_try(lambda: Attendance.search_count(scope + [('check_out', '=', False)]), 0),
            'checked_today': checked_today,
            'not_checked': max(0, headcount - checked_today),
            'headcount': headcount,
            'hours': round(hours, 1), 'hours_prev': round(hours_prev, 1), 'hours_delta': growth(hours, hours_prev),
            'avg_day': round(hours / worked_days, 1) if worked_days else 0.0,
            'overtime': round(overtime, 1),
            'overtime_to_approve': self._employee_modern_try(lambda: Attendance.search_count(
                scope + [('overtime_status', '=', 'to_approve'), ('check_out', '!=', False)]), 0),
        }
        days, spark = self._attendance_modern_days(Attendance, scope, today, at)
        data = head['payload']
        data.update({
            'kpis': kpis,
            'days': days,
            'spark': spark,
            'by_department': self._attendance_modern_by_department(Attendance, scope + within(start, end)),
            'top_overtime': self._attendance_modern_top(Attendance, scope + within(start, end)),
            'attention': self._attendance_modern_attention(Attendance, scope, today, at),
            'at_work_list': self._attendance_modern_rows(Attendance, scope + [('check_out', '=', False)], 'check_in desc', 12),
            'recent': self._attendance_modern_rows(Attendance, scope, 'check_in desc', 40),
        })
        return data

    @api.model
    @_safe(([], [0] * 14))
    def _attendance_modern_days(self, Attendance, scope, today, at):
        """Hours worked per day over the last 14 days, with the 14 days before."""
        first = today - timedelta(days=13)
        prev_first = first - timedelta(days=14)
        groups = Attendance._read_group(
            scope + [('check_in', '>=', at(prev_first)), ('check_in', '<', at(today + timedelta(days=1)))],
            ['date:day'], ['worked_hours:sum'])
        by_day = {}
        for day, value in groups:
            if day:
                day = day.date() if hasattr(day, 'date') and callable(day.date) else day
                by_day[day] = round(value or 0.0, 1)
        days = []
        for i in range(14):
            day = first + timedelta(days=i)
            days.append({
                'label': day.strftime('%a %d'),
                'value': by_day.get(day, 0),
                'previous': by_day.get(day - timedelta(days=14), 0),
                'future': False,
            })
        return days, [d['value'] for d in days]

    @api.model
    @_safe([])
    def _attendance_modern_by_department(self, Attendance, domain):
        totals = {}
        for employee, value in Attendance._read_group(domain, ['employee_id'], ['worked_hours:sum']):
            department = employee.department_id
            key = department.id or 0
            label = department.name if department else self.env._('No department')
            row = totals.setdefault(key, {'id': key, 'label': label, 'value': 0.0})
            row['value'] += value or 0.0
        rows = sorted(totals.values(), key=lambda r: -r['value'])[:8]
        for row in rows:
            row['value'] = round(row['value'], 1)
        return [r for r in rows if r['value']]

    @api.model
    @_safe([])
    def _attendance_modern_top(self, Attendance, domain):
        groups = Attendance._read_group(domain + [('overtime_hours', '>', 0)], ['employee_id'], ['overtime_hours:sum'],
                                        order='overtime_hours:sum desc', limit=6)
        return [{'id': e.id, 'label': e.display_name, 'value': round(v or 0.0, 1)} for e, v in groups if v]

    @api.model
    @_safe([])
    def _attendance_modern_rows(self, Attendance, domain, order, limit):
        names = [n for n in ('employee_id', 'check_in', 'check_out', 'worked_hours', 'overtime_hours',
                             'overtime_status', 'in_mode') if n in Attendance._fields]
        rows = Attendance.search_read(domain, names, order=order, limit=limit)
        departments = {e.id: e.department_id.display_name or '' for e in self.browse(
            [r['employee_id'][0] for r in rows if r.get('employee_id')]).exists()}
        for row in rows:
            row['department'] = departments.get(row['employee_id'][0], '') if row.get('employee_id') else ''
        return rows

    @api.model
    @_safe([])
    def _attendance_modern_attention(self, Attendance, scope, today, at):
        _ = self.env._
        checks = [
            ('overtime', 'warning', 'fa-clock-o', _('Extra hours to approve'),
             [('overtime_status', '=', 'to_approve'), ('check_out', '!=', False)]),
            ('open', 'danger', 'fa-sign-in', _('Still checked in since yesterday'),
             [('check_out', '=', False), ('check_in', '<', at(today))]),
            ('long', 'info', 'fa-hourglass-end', _('Shifts of 16 hours or more (this month)'),
             [('worked_hours', '>=', 16), ('check_in', '>=', at(date_utils.start_of(today, 'month')))]),
            ('auto', 'slate', 'fa-magic', _('Automatically checked out (this month)'),
             [('out_mode', '=', 'auto_check_out'), ('check_in', '>=', at(date_utils.start_of(today, 'month')))]),
        ]
        items = []
        for key, tone, icon, label, domain in checks:
            n = self._employee_modern_try(lambda d=domain: Attendance.search_count(scope + d), None)
            if n is not None:
                items.append({'key': key, 'model': 'hr.attendance', 'count': n, 'tone': tone, 'icon': icon,
                              'label': label, 'domain': _json_domain(domain)})
        return items
