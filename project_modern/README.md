# Modern Project

Odoo 19 Community — the Project app with the look of Modern CRM.

* **Sidebar** (everyday work): Dashboard, Projects, My Tasks, All Tasks.
* **Top bar**: More (Overdue, Unassigned, Closed tasks), Odoo's Reporting and Configuration
  (Task Stages and Tags open in the CRM-style drawer).
* **Projects**: CRM-style cards (progress, open / done tasks, manager, status). A card opens
  the project's **task board**: one column per stage, drag and drop, quick create in a column.
* **Tasks**: CRM-style cards with sub-task progress, assignees, deadline, priority, activities
  and Odoo's state toggle. A task opens as Odoo's own full page (sub-tasks, blocked by,
  timesheets, chatter). "New" opens the CRM drawer (title, project, assignees, deadline,
  priority, tags; "More fields" opens the full form).
* **Dashboard**: open / completed / overdue / due / my / new tasks, completion per month,
  what needs attention, tasks by stage, workload per person, status, project progress and
  "My tasks" (tick to mark done).

No new table or field: everything uses Odoo's project.project, project.task,
project.task.type and project.tags, with Odoo's own rights. The cards are standalone views
(no xpath into Odoo's), so an Odoo update cannot break them.

Depends on `modern_theme` and `project`.
