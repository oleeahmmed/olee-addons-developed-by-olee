"""Modern Project: view ids of the pages and the projects dashboard.

Read-only, on Odoo's own project.project / project.task (no new table or field).
Every figure is read with the user's own rights, record rules and allowed companies.
"""
import functools
import logging
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.addons.modern_theme.tools import PERIODS, growth, local_midnight, month_key, period_bounds
from odoo.tools import date_utils

_logger = logging.getLogger(__name__)

CLOSED = ('1_done', '1_canceled')
STATE_TONES = {
    '01_in_progress': 'blue',
    '02_changes_requested': 'amber',
    '03_approved': 'teal',
    '04_waiting_normal': 'violet',
    '1_done': 'teal',
    '1_canceled': 'slate',
}
PROJECT_STATUS_TONES = {
    'on_track': 'teal', 'at_risk': 'amber', 'off_track': 'rose', 'on_hold': 'sky', 'done': 'violet', 'to_define': 'slate',
}


def _safe(default):
    """A dashboard block that cannot be computed (field moved by an Odoo update…) is left
    out instead of breaking the whole dashboard."""
    def deco(func):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                with self.env.cr.savepoint():
                    return func(self, *args, **kwargs)
            except Exception:  # noqa: BLE001
                _logger.warning("project_modern: dashboard block %s skipped", func.__name__, exc_info=True)
                return default
        return wrapper
    return deco


def _json(value):
    if isinstance(value, datetime):
        return fields.Datetime.to_string(value)
    if hasattr(value, 'isoformat'):
        return fields.Date.to_string(value)
    return value


def _json_domain(domain):
    return [[t[0], t[1], _json(t[2])] if isinstance(t, (list, tuple)) and len(t) == 3 else t for t in domain]


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

    # ------------------------------------------------------------------
    # Projects dashboard
    # ------------------------------------------------------------------
    @api.model
    def project_modern_dashboard(self, period='month', project_id=False):
        period = period if period in PERIODS else 'month'
        today = fields.Date.context_today(self)
        start, end, prev_start, prev_end = period_bounds(today, period)
        as_dt = functools.partial(local_midnight, tz=self.env.tz)
        Task = self.with_context(active_test=True)
        scope = [('project_id', '!=', False), ('is_template', '=', False),
                 ('company_id', 'in', self.env.companies.ids + [False])]
        if 'has_project_template' in self._fields:
            scope.append(('has_project_template', '=', False))
        if project_id:
            scope.append(('project_id', '=', project_id))
        open_ = [('state', 'not in', CLOSED)]

        def count(domain):
            return Task.search_count(scope + domain)

        def closed_between(a, b):
            return ['&', ('state', 'in', CLOSED), '|',
                    '&', ('date_end', '>=', as_dt(a)), ('date_end', '<', as_dt(b)),
                    '&', ('date_end', '=', False), '&', ('write_date', '>=', as_dt(a)), ('write_date', '<', as_dt(b))]

        def created_between(a, b):
            return [('create_date', '>=', as_dt(a)), ('create_date', '<', as_dt(b))]

        week_end = today + timedelta(days=7 - today.weekday())
        done = self._project_modern_try(lambda: count(closed_between(start, end)), 0)
        done_prev = self._project_modern_try(lambda: count(closed_between(prev_start, prev_end)), 0)
        created = self._project_modern_try(lambda: count(created_between(start, end)), 0)
        created_prev = self._project_modern_try(lambda: count(created_between(prev_start, prev_end)), 0)
        kpis = {
            'open': count(open_),
            'projects': self._project_modern_project_count(project_id),
            'done': done, 'done_prev': done_prev, 'done_delta': growth(done, done_prev),
            'created': created, 'created_prev': created_prev, 'created_delta': growth(created, created_prev),
            'overdue': self._project_modern_try(lambda: count(open_ + [('date_deadline', '<', as_dt(today))]), 0),
            'due_week': self._project_modern_try(lambda: count(open_ + [('date_deadline', '>=', as_dt(today)),
                                                                        ('date_deadline', '<', as_dt(week_end))]), 0),
            'mine': self._project_modern_try(lambda: count(open_ + [('user_ids', 'in', self.env.uid)]), 0),
        }
        months, spark = self._project_modern_done_by_month(scope, today, end, as_dt)
        return {
            'period': period,
            'range': [fields.Date.to_string(start), fields.Date.to_string(today)],
            'today': fields.Date.to_string(today),
            'week_end': fields.Date.to_string(week_end),
            'year': today.year,
            'company': self.env.company.name,
            'project_id': project_id or False,
            'project_list': self._project_modern_project_list(),
            'kpis': kpis,
            'spark': spark,
            'months': months,
            'by_stage': self._project_modern_by_stage(scope + open_),
            'by_user': self._project_modern_by_user(scope + open_),
            'by_state': self._project_modern_by_state(scope + open_),
            'attention': self._project_modern_attention(scope + open_, today, as_dt),
            'projects': self._project_modern_projects(project_id),
            'my_tasks': self._project_modern_my_tasks(scope + open_),
        }

    # ------------------------------------------------------------------
    # Blocks
    # ------------------------------------------------------------------
    @api.model
    def _project_modern_try(self, func, default):
        try:
            with self.env.cr.savepoint():
                return func()
        except Exception:  # noqa: BLE001
            _logger.warning("project_modern: dashboard figure skipped", exc_info=True)
            return default

    def _project_modern_project_domain(self, project_id=False):
        domain = [('is_template', '=', False), ('company_id', 'in', self.env.companies.ids + [False])]
        if project_id:
            domain.append(('id', '=', project_id))
        return domain

    @api.model
    @_safe(0)
    def _project_modern_project_count(self, project_id):
        return self.env['project.project'].search_count(self._project_modern_project_domain(project_id))

    @api.model
    @_safe([])
    def _project_modern_project_list(self):
        projects = self.env['project.project'].search_read(self._project_modern_project_domain(), ['name'], order='name')
        return [{'id': p['id'], 'name': p['name']} for p in projects]

    @api.model
    @_safe(([], [0] * 12))
    def _project_modern_done_by_month(self, scope, today, end, as_dt):
        year_start = date_utils.start_of(today, 'year')

        def monthly(a, b):
            """Closed tasks per month: the end date Odoo sets when a task reaches a folded
            stage, else the last change (tasks closed with the Done / Cancelled state)."""
            result = {}
            closed = scope + [('state', 'in', CLOSED)]
            for field, extra in (('date_end', []), ('write_date', [('date_end', '=', False)])):
                groups = self._read_group(
                    closed + extra + [(field, '>=', as_dt(a)), (field, '<', as_dt(b))],
                    [f'{field}:month'], ['__count'])
                for m, c in groups:
                    if m:
                        key = month_key(m)
                        result[key] = result.get(key, 0) + c
            return result

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
    def _project_modern_by_stage(self, domain):
        """Open tasks per stage name (stages of different projects with the same name add up)."""
        groups = self._read_group(domain + [('stage_id', '!=', False)], ['stage_id'], ['__count'])
        totals = {}
        for stage, n in groups:
            key = stage.name or ''
            entry = totals.setdefault(key, {'label': key, 'value': 0, 'ids': [], 'sequence': stage.sequence})
            entry['value'] += n
            entry['ids'].append(stage.id)
            entry['sequence'] = min(entry['sequence'], stage.sequence)
        rows = sorted(totals.values(), key=lambda r: (r['sequence'], r['label']))
        total = sum(r['value'] for r in rows) or 1
        return [{
            'id': i, 'label': r['label'], 'value': r['value'], 'stage_ids': r['ids'],
            'pct': round(r['value'] * 100.0 / total, 1),
        } for i, r in enumerate(rows[:8], start=1)]

    @api.model
    @_safe([])
    def _project_modern_by_user(self, domain):
        groups = self._read_group(domain + [('user_ids', '!=', False)], ['user_ids'], ['__count'],
                                  order='__count desc', limit=7)
        rows = [{'id': u.id, 'label': u.name, 'value': n, 'avatar': u.id} for u, n in groups]
        nobody = self.search_count(domain + [('user_ids', '=', False)])
        if nobody:
            rows.append({'id': 0, 'label': self.env._('Unassigned'), 'value': nobody})
        return rows

    @api.model
    @_safe([])
    def _project_modern_by_state(self, domain):
        labels = dict(self._fields['state']._description_selection(self.env))
        groups = self._read_group(domain, ['state'], ['__count'], order='__count desc')
        return [{'id': i, 'key': s, 'label': labels.get(s, s), 'value': n, 'tone': STATE_TONES.get(s, 'slate')}
                for i, (s, n) in enumerate(groups, start=1) if n]

    @api.model
    @_safe([])
    def _project_modern_attention(self, domain, today, as_dt):
        _ = self.env._
        checks = [
            ('overdue', 'danger', 'fa-calendar-times-o', _('Overdue tasks'), [('date_deadline', '<', as_dt(today))]),
            ('urgent', 'warning', 'fa-star', _('High priority tasks'), [('priority', 'in', ('2', '3'))]),
            ('changes', 'warning', 'fa-pencil-square-o', _('Changes requested'), [('state', '=', '02_changes_requested')]),
            ('waiting', 'info', 'fa-hourglass-half', _('Waiting on another task'), [('state', '=', '04_waiting_normal')]),
            ('unassigned', 'slate', 'fa-user-times', _('Tasks nobody is assigned to'), [('user_ids', '=', False)]),
            ('no_deadline', 'slate', 'fa-calendar-o', _('Tasks without a deadline'), [('date_deadline', '=', False)]),
            ('activities', 'warning', 'fa-clock-o', _('Tasks with overdue activities'), [('activity_state', '=', 'overdue')]),
        ]
        items = []
        for key, tone, icon, label, check in checks:
            n = self._project_modern_try(lambda d=check: self.search_count(domain + d), None)
            if n is not None:
                items.append({'key': key, 'count': n, 'tone': tone, 'icon': icon, 'label': label,
                              'domain': _json_domain(check)})
        return items

    @api.model
    @_safe([])
    def _project_modern_projects(self, project_id):
        Project = self.env['project.project']
        names = ['name', 'partner_id', 'user_id', 'date', 'task_count', 'open_task_count', 'closed_task_count',
                 'last_update_status', 'is_favorite']
        names = [n for n in names if n in Project._fields]
        projects = Project.search_read(self._project_modern_project_domain(project_id), names,
                                       order='is_favorite desc, sequence, name', limit=12)
        labels = dict(Project._fields['last_update_status']._description_selection(self.env)) \
            if 'last_update_status' in Project._fields else {}
        rows = []
        for p in projects:
            total = p.get('task_count') or 0
            closed = p.get('closed_task_count') or 0
            status = p.get('last_update_status') or 'to_define'
            rows.append({
                'id': p['id'],
                'label': p['name'],
                'value': f"{closed}/{total}",
                'sub': ' · '.join(filter(None, [
                    p['partner_id'] and p['partner_id'][1],
                    p['user_id'] and p['user_id'][1],
                    labels.get(status) if status != 'to_define' else '',
                ])),
                'pct': round(closed * 100.0 / total, 1) if total else 0,
                'tone': PROJECT_STATUS_TONES.get(status, 'blue'),
            })
        return rows

    @api.model
    @_safe([])
    def _project_modern_my_tasks(self, domain):
        tasks = self.search_read(domain + [('user_ids', 'in', self.env.uid)],
                                 ['name', 'project_id', 'priority', 'date_deadline', 'parent_id'],
                                 order='priority desc, date_deadline asc, id desc', limit=8)
        return [{
            'id': t['id'],
            'name': t['name'],
            'project': t['project_id'] and t['project_id'][1] or '',
            'parent': t['parent_id'] and t['parent_id'][1] or '',
            'priority': t['priority'],
            'deadline': _json(t['date_deadline']) if t['date_deadline'] else False,
        } for t in tasks]

    @api.model
    def project_modern_mark_done(self, task_id):
        """Tick of the dashboard's "My tasks": Odoo's own Done state (write access checked)."""
        task = self.browse(task_id).exists()
        if task:
            task.write({'state': '1_done'})
        return True
