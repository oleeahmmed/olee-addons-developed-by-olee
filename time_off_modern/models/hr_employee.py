"""Modern Time Off: the Time Off dashboard (read-only, on Odoo's own hr.leave / hr.leave.allocation)."""
from datetime import timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, models
from odoo.addons.employee_modern.models.hr_employee import _json_domain, _safe
from odoo.addons.modern_theme.tools import growth, month_key
from odoo.tools import date_utils

LEAVE_PENDING = ('confirm', 'validate1')


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

    # ------------------------------------------------------------------
    # Time Off
    # ------------------------------------------------------------------
    @api.model
    def employee_modern_timeoff_dashboard(self, period='month', department_id=False):
        if 'hr.leave' not in self.env:
            return {'installed': False}
        head = self._employee_modern_head(period, department_id)
        today, at = head['today'], head['midnight']
        start, end, prev_start, prev_end = head['bounds']
        Leave = self.env['hr.leave']
        scope = [('employee_company_id', 'in', self.env.companies.ids)]
        if department_id:
            scope.append(('department_id', 'child_of', department_id))

        def taken(a, b):
            return [('state', '=', 'validate'), ('request_date_from', '>=', a), ('request_date_from', '<', b)]

        tomorrow = today + timedelta(days=1)
        out_today = [('state', '=', 'validate'), ('date_from', '<', at(tomorrow)), ('date_to', '>=', at(today))]
        days = self._employee_modern_try(lambda: self._employee_modern_sum(Leave, scope + taken(start, end), 'number_of_days'), 0.0)
        days_prev = self._employee_modern_try(
            lambda: self._employee_modern_sum(Leave, scope + taken(prev_start, prev_end), 'number_of_days'), 0.0)
        alloc_scope = [('employee_id.company_id', 'in', self.env.companies.ids)]
        if department_id:
            alloc_scope.append(('employee_id.department_id', 'child_of', department_id))
        Allocation = self.env['hr.leave.allocation']

        kpis = {
            'out_today': self._employee_modern_try(lambda: Leave.search_count(scope + out_today), 0),
            'to_approve': self._employee_modern_try(lambda: Leave.search_count(scope + [('state', 'in', LEAVE_PENDING)]), 0),
            'alloc_to_approve': self._employee_modern_try(
                lambda: Allocation.search_count(alloc_scope + [('state', 'in', LEAVE_PENDING)]), 0),
            'days': round(days, 1), 'days_prev': round(days_prev, 1), 'days_delta': growth(days, days_prev),
            'requests': self._employee_modern_try(lambda: Leave.search_count(
                scope + [('request_date_from', '>=', start), ('request_date_from', '<', end),
                         ('state', 'not in', ('cancel', 'refuse'))]), 0),
            'upcoming': self._employee_modern_try(lambda: Leave.search_count(scope + [
                ('state', '=', 'validate'), ('request_date_from', '>', today),
                ('request_date_from', '<=', today + timedelta(days=7))]), 0),
            'refused': self._employee_modern_try(lambda: Leave.search_count(scope + [
                ('state', '=', 'refuse'), ('request_date_from', '>=', start), ('request_date_from', '<', end)]), 0),
        }
        months, spark = self._employee_modern_leave_months(Leave, scope, today, end)
        data = head['payload']
        data.update({
            'kpis': kpis,
            'months': months,
            'spark': spark,
            'by_type': self._employee_modern_leave_by(Leave, scope + taken(start, end), 'holiday_status_id'),
            'by_department': self._employee_modern_leave_by(Leave, scope + taken(start, end), 'department_id'),
            'attention': self._employee_modern_leave_attention(Leave, Allocation, scope, alloc_scope, today),
            'out_list': self._employee_modern_leave_rows(Leave, scope + out_today, 'date_to asc', 12),
            'pending': self._employee_modern_leave_rows(Leave, scope + [('state', 'in', LEAVE_PENDING)], 'request_date_from asc', 40),
            'upcoming_list': self._employee_modern_leave_rows(Leave, scope + [
                ('state', 'in', ('validate',) + LEAVE_PENDING), ('request_date_from', '>', today),
                ('request_date_from', '<=', today + timedelta(days=30))], 'request_date_from asc', 12),
        })
        return data

    @api.model
    @_safe(([], [0] * 12))
    def _employee_modern_leave_months(self, Leave, scope, today, end):
        year_start = date_utils.start_of(today, 'year')

        def monthly(a, b):
            groups = Leave._read_group(
                scope + [('state', '=', 'validate'), ('request_date_from', '>=', a), ('request_date_from', '<', b)],
                ['request_date_from:month'], ['number_of_days:sum'])
            return {month_key(m): round(v or 0.0, 1) for m, v in groups if m}

        this_year = monthly(year_start, year_start + relativedelta(years=1))
        last_year = monthly(year_start - relativedelta(years=1), year_start)
        months = []
        for i in range(12):
            month = year_start + relativedelta(months=i)
            months.append({
                'label': month.strftime('%b'),
                'value': this_year.get(month, 0),
                'previous': last_year.get(month - relativedelta(years=1), 0),
                'future': month > today,
            })
        spark_start = date_utils.start_of(today, 'month') - relativedelta(months=11)
        spark_map = monthly(spark_start, end)
        return months, [spark_map.get(spark_start + relativedelta(months=i), 0) for i in range(12)]

    @api.model
    @_safe([])
    def _employee_modern_leave_by(self, Leave, domain, field):
        groups = Leave._read_group(domain + [(field, '!=', False)], [field], ['number_of_days:sum'],
                                   order='number_of_days:sum desc', limit=8)
        return [{'id': rec.id, 'label': rec.display_name, 'value': round(v or 0.0, 1)} for rec, v in groups if v]

    @api.model
    @_safe([])
    def _employee_modern_leave_rows(self, Leave, domain, order, limit):
        names = [n for n in ('employee_id', 'holiday_status_id', 'request_date_from', 'request_date_to',
                             'number_of_days', 'duration_display', 'state', 'department_id', 'name')
                 if n in Leave._fields]
        return Leave.search_read(domain, names, order=order, limit=limit)

    @api.model
    @_safe([])
    def _employee_modern_leave_attention(self, Leave, Allocation, scope, alloc_scope, today):
        _ = self.env._
        checks = [
            ('leave', 'to_approve', 'warning', 'fa-clock-o', _('Time off waiting for approval'),
             [('state', '=', 'confirm')]),
            ('leave', 'second', 'info', 'fa-check-square-o', _('Waiting for the second approval'),
             [('state', '=', 'validate1')]),
            ('leave', 'soon', 'danger', 'fa-exclamation-triangle', _('Starting in 3 days, not approved yet'),
             [('state', 'in', LEAVE_PENDING), ('request_date_from', '<=', today + timedelta(days=3))]),
            ('allocation', 'allocations', 'violet', 'fa-plus-square-o', _('Allocations to approve'),
             [('state', 'in', LEAVE_PENDING)]),
        ]
        items = []
        for model, key, tone, icon, label, domain in checks:
            base = alloc_scope if model == 'allocation' else scope
            Model = Allocation if model == 'allocation' else Leave
            n = self._employee_modern_try(lambda d=domain, b=base, M=Model: M.search_count(b + d), None)
            if n is not None:
                items.append({'key': key, 'model': Model._name, 'count': n, 'tone': tone, 'icon': icon,
                              'label': label, 'domain': _json_domain(domain)})
        return items

