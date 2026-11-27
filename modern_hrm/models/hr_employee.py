"""Modern Employees: views and the people dashboard of the Employees app.

Read-only, on Odoo's own hr.employee / hr.department / hr.job (no new table or field).
Every figure is read with the user's own rights, record rules and allowed companies.
Time Off and Attendances figures only appear when those apps are installed and readable.

Since Odoo 19 the job, department, contract dates and employee type live on hr.version
(the employee's current version, inherited by hr.employee), exactly as Odoo's own
employee pivot and graph read them.
"""
import functools
import logging
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import PERIODS, growth, local_midnight, month_key, period_bounds
from odoo.tools import date_utils

_logger = logging.getLogger(__name__)

EMPLOYEE_TYPES_TONE = {
    'employee': 'blue', 'worker': 'teal', 'student': 'violet',
    'trainee': 'amber', 'contractor': 'sky', 'freelance': 'rose',
}


def _safe(default):
    """A dashboard block that cannot be computed (missing app, field moved by an Odoo
    update…) is left out instead of breaking the whole dashboard."""
    def deco(func):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                with self.env.cr.savepoint():
                    return func(self, *args, **kwargs)
            except Exception:  # noqa: BLE001
                _logger.warning("employee_modern: dashboard block %s skipped", func.__name__, exc_info=True)
                return default
        return wrapper
    return deco


def _json_domain(domain):
    """Domain with dates / datetimes as strings, ready for the client."""
    out = []
    for term in domain:
        if isinstance(term, (list, tuple)) and len(term) == 3:
            f, op, v = term
            if isinstance(v, datetime):
                v = fields.Datetime.to_string(v)
            elif hasattr(v, 'isoformat'):
                v = fields.Date.to_string(v)
            out.append([f, op, v])
        else:
            out.append(term)
    return out


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

    # ------------------------------------------------------------------
    # People dashboard
    # ------------------------------------------------------------------
    @api.model
    def employee_modern_dashboard(self, period='month', department_id=False):
        period = period if period in PERIODS else 'month'
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        Employee = self.with_context(active_test=True)
        scope = [('company_id', 'in', self.env.companies.ids)]
        if department_id:
            scope.append(('department_id', 'child_of', department_id))

        def count(domain, archived=False):
            model = Employee.with_context(active_test=False) if archived else Employee
            return model.search_count(scope + domain)

        def started(a, b):
            return [('contract_date_start', '>=', a), ('contract_date_start', '<', b)]

        def left(a, b):
            return [('active', '=', False), ('departure_date', '>=', a), ('departure_date', '<', b)]

        headcount = count([])
        hires = self._employee_modern_try(lambda: count(started(start, end)), 0)
        hires_prev = self._employee_modern_try(lambda: count(started(prev_start, prev_end)), 0)
        departures = self._employee_modern_try(lambda: count(left(start, end), archived=True), 0)
        departures_prev = self._employee_modern_try(lambda: count(left(prev_start, prev_end), archived=True), 0)
        year_ago = today - relativedelta(years=1)
        left_12m = self._employee_modern_try(lambda: count(left(year_ago, end), archived=True), 0)
        soon = today + timedelta(days=30)
        ending = self._employee_modern_try(lambda: count([('contract_date_end', '>=', today), ('contract_date_end', '<=', soon)]), 0)

        dept_domain = [('company_id', 'in', self.env.companies.ids + [False])]
        if department_id:
            dept_domain.append(('id', 'child_of', department_id))
        departments = self.env['hr.department'].search_count(dept_domain)

        kpis = {
            'headcount': headcount,
            'hires': hires, 'hires_prev': hires_prev, 'hires_delta': growth(hires, hires_prev),
            'departures': departures, 'departures_prev': departures_prev,
            'departures_delta': growth(departures, departures_prev),
            'turnover': round(left_12m * 100.0 / (headcount + left_12m), 1) if (headcount + left_12m) else 0.0,
            'departments': departments,
            'ending': ending,
            'tenure': self._employee_modern_tenure(scope, today),
            'managers': self._employee_modern_try(lambda: len(Employee._read_group(
                scope + [('parent_id', '!=', False)], ['parent_id'])), 0),
        }

        months, spark = self._employee_modern_hires_by_month(scope, today, end)
        return {
            'period': period,
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'year': today.year,
            'company': self.env.company.name,
            'department_id': department_id or False,
            'department_list': self._employee_modern_department_list(),
            'kpis': kpis,
            'spark': spark,
            'months': months,
            'by_department': self._employee_modern_by_department(scope),
            'by_job': self._employee_modern_by_job(scope),
            'by_type': self._employee_modern_by_type(scope),
            'by_gender': self._employee_modern_by_gender(scope),
            'attention': self._employee_modern_attention(scope, today),
            'birthdays': self._employee_modern_birthdays(scope, today),
            'presence': self._employee_modern_presence(scope, today),
            'recent': self._employee_modern_recent(scope),
        }

    # ------------------------------------------------------------------
    # Blocks
    # ------------------------------------------------------------------
    @api.model
    def _employee_modern_try(self, func, default):
        try:
            with self.env.cr.savepoint():
                return func()
        except Exception:  # noqa: BLE001
            _logger.warning("employee_modern: dashboard figure skipped", exc_info=True)
            return default

    @api.model
    @_safe(None)
    def _employee_modern_tenure(self, scope, today):
        """Average years since the contract start of the current employees."""
        starts = [r['contract_date_start'] for r in self.search_read(
            scope + [('contract_date_start', '!=', False), ('contract_date_start', '<=', today)],
            ['contract_date_start'])]
        if not starts:
            return None
        days = sum((today - d).days for d in starts) / len(starts)
        return round(days / 365.25, 1)

    @api.model
    @_safe(([], [0] * 12))
    def _employee_modern_hires_by_month(self, scope, today, end):
        year_start = date_utils.start_of(today, 'year')

        def monthly(a, b):
            groups = self._read_group(
                scope + [('contract_date_start', '>=', a), ('contract_date_start', '<', b)],
                ['contract_date_start:month'], ['__count'])
            return {month_key(m): c for m, c in groups if m}

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
        spark = [spark_map.get(spark_start + relativedelta(months=i), 0) for i in range(12)]
        return months, spark

    @api.model
    @_safe([])
    def _employee_modern_department_list(self):
        departments = self.env['hr.department'].search_read(
            [('company_id', 'in', self.env.companies.ids + [False])], ['complete_name'])
        rows = [{'id': d['id'], 'name': d['complete_name'] or ''} for d in departments]
        return sorted(rows, key=lambda r: r['name'].lower())

    @api.model
    @_safe([])
    def _employee_modern_by_department(self, scope):
        groups = self._read_group(scope + [('department_id', '!=', False)], ['department_id'], ['__count'],
                                  order='__count desc', limit=8)
        rows = [{'id': d.id, 'label': d.name, 'value': n} for d, n in groups]
        without = self.search_count(scope + [('department_id', '=', False)])
        if without:
            rows.append({'id': 0, 'label': self.env._('No department'), 'value': without})
        return rows

    @api.model
    @_safe([])
    def _employee_modern_by_job(self, scope):
        groups = self._read_group(scope + [('job_id', '!=', False)], ['job_id'], ['__count'],
                                  order='__count desc', limit=6)
        return [{'id': j.id, 'label': j.display_name, 'value': n} for j, n in groups]

    @api.model
    @_safe([])
    def _employee_modern_by_type(self, scope):
        labels = dict(self._fields['employee_type']._description_selection(self.env))
        groups = self._read_group(scope, ['employee_type'], ['__count'], order='__count desc')
        return [{'id': i, 'key': t, 'label': labels.get(t, t or self.env._('Not set')), 'value': n,
                 'tone': EMPLOYEE_TYPES_TONE.get(t, 'slate')}
                for i, (t, n) in enumerate(groups, start=1) if n]

    @api.model
    @_safe([])
    def _employee_modern_by_gender(self, scope):
        labels = dict(self._fields['sex']._description_selection(self.env))
        groups = self._read_group(scope + [('sex', '!=', False)], ['sex'], ['__count'], order='__count desc')
        return [{'id': i, 'key': s, 'label': labels.get(s, s), 'value': n}
                for i, (s, n) in enumerate(groups, start=1) if n]

    @api.model
    @_safe([])
    def _employee_modern_attention(self, scope, today):
        _ = self.env._
        checks = [
            ('ending', 'warning', 'fa-file-text-o', _('Contracts ending in 30 days'),
             [('contract_date_end', '>=', today), ('contract_date_end', '<=', today + timedelta(days=30))]),
            ('trial', 'info', 'fa-hourglass-half', _('Trial periods ending in 14 days'),
             [('trial_date_end', '>=', today), ('trial_date_end', '<=', today + timedelta(days=14))]),
            ('permit', 'danger', 'fa-id-card-o', _('Work permits expiring in 60 days'),
             [('work_permit_expiration_date', '>=', today),
              ('work_permit_expiration_date', '<=', today + timedelta(days=60))]),
            ('no_manager', 'slate', 'fa-user-times', _('Employees without a manager'), [('parent_id', '=', False)]),
            ('no_department', 'slate', 'fa-sitemap', _('Employees without a department'), [('department_id', '=', False)]),
            ('activities', 'warning', 'fa-clock-o', _('Employees with overdue activities'),
             [('activity_state', '=', 'overdue')]),
        ]
        items = []
        for key, tone, icon, label, domain in checks:
            n = self._employee_modern_try(lambda d=domain: self.search_count(scope + d), None)
            if n is not None:
                items.append({'key': key, 'count': n, 'tone': tone, 'icon': icon, 'label': label, 'domain': domain})
        # domains go to the client as JSON (dates as strings)
        for item in items:
            item['domain'] = [
                (f, op, fields.Date.to_string(v) if hasattr(v, 'isoformat') else v) for f, op, v in item['domain']
            ]
        return items

    @api.model
    @_safe([])
    def _employee_modern_birthdays(self, scope, today):
        """Birthdays in the next 30 days (Odoo's own birthday field)."""
        horizon = today + timedelta(days=30)
        rows = []
        for e in self.search_read(scope + [('birthday', '!=', False)],
                                  ['name', 'birthday', 'job_title', 'department_id']):
            b = e['birthday']
            try:
                next_day = b.replace(year=today.year)
            except ValueError:  # 29 February
                next_day = b.replace(year=today.year, day=28)
            if next_day < today:
                try:
                    next_day = next_day.replace(year=today.year + 1)
                except ValueError:
                    next_day = next_day.replace(year=today.year + 1, day=28)
            if next_day <= horizon:
                rows.append({
                    'id': e['id'],
                    'name': e['name'],
                    'text': e['job_title'] or (e['department_id'] and e['department_id'][1]) or '',
                    'date': fields.Date.to_string(next_day),
                    'days': (next_day - today).days,
                })
        rows.sort(key=lambda r: r['days'])
        return rows[:8]

    @api.model
    @_safe(False)
    def _employee_modern_presence(self, scope, today):
        """Who is out / in today, only with Time Off and / or Attendances installed."""
        tiles = []
        as_dt = functools.partial(local_midnight, tz=self.env.tz)
        employees = self.search(scope)
        if 'hr.leave' in self.env and self.env['hr.leave'].browse().has_access('read'):
            out = self.env['hr.leave'].search_count([
                ('state', '=', 'validate'), ('employee_id', 'in', employees.ids),
                ('date_from', '<', as_dt(today + timedelta(days=1))), ('date_to', '>=', as_dt(today)),
            ])
            pending = self.env['hr.leave'].search_count([
                ('state', 'in', ('confirm', 'validate1')), ('employee_id', 'in', employees.ids)])
            tiles += [
                {'key': 'out', 'label': self.env._('Out today'), 'count': out, 'tone': 'amber', 'icon': 'fa-plane'},
                {'key': 'pending', 'label': self.env._('Time off to approve'), 'count': pending, 'tone': 'violet',
                 'icon': 'fa-check-square-o'},
            ]
        if 'hr.attendance' in self.env and self.env['hr.attendance'].browse().has_access('read'):
            present = self.env['hr.attendance'].search_count([
                ('employee_id', 'in', employees.ids), ('check_out', '=', False)])
            tiles.append({'key': 'present', 'label': self.env._('Checked in now'), 'count': present,
                          'tone': 'teal', 'icon': 'fa-sign-in'})
        return tiles or False

    @api.model
    @_safe([])
    def _employee_modern_recent(self, scope):
        names = ['name', 'job_title', 'job_id', 'department_id', 'parent_id', 'work_email', 'work_phone',
                 'employee_type', 'contract_date_start', 'create_date']
        names = [n for n in names if n in self._fields]
        order = 'contract_date_start desc, create_date desc, id desc' if 'contract_date_start' in self._fields else 'create_date desc'
        try:
            with self.env.cr.savepoint():
                return self.search_read(scope, names, order=order, limit=40)
        except Exception:  # noqa: BLE001  (ordering on a delegated field not supported)
            return self.search_read(scope, names, order='create_date desc, id desc', limit=40)

    # ------------------------------------------------------------------
    # Shared by Modern Time Off / Modern Attendances (period + department header)
    # ------------------------------------------------------------------
    @api.model
    def _employee_modern_head(self, period, department_id):
        period = period if period in PERIODS else 'month'
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        return {
            'period': period,
            'today': today,
            'bounds': (start, end, prev_start, prev_end),
            'midnight': functools.partial(local_midnight, tz=self.env.tz),
            'payload': {
                'installed': True,
                'period': period,
                'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
                'today': fields.Date.to_string(today),
                'year': today.year,
                'company': self.env.company.name,
                'department_id': department_id or False,
                'department_list': self._employee_modern_department_list(),
            },
        }

    @api.model
    def _employee_modern_sum(self, model, domain, field):
        groups = model._read_group(domain, [], [f'{field}:sum'])
        return (groups[0][0] if groups else 0.0) or 0.0
