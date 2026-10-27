# Modern Employees (employee_modern)

A modern, shadcn-style workspace for Odoo 19's **Employees** app, built the same way as
Modern Sales / Purchase / Contacts on top of `modern_theme`'s app kit.

## What you get

Three apps, each with a short sidebar (everyday work) and the rest in the top bar:

| App | Sidebar | Top bar |
|---|---|---|
| **Employees** (this addon) | Dashboard, Employees, Departments | More → Records (New Hires, Contracts Ending, Former Employees, Job Positions, Employee History), Reporting, Configuration |
| **Time Off** (`time_off_modern`) | Dashboard, Requests, Allocations, Team Calendar | My Time, Reporting, Configuration |
| **Attendances** (`attendance_modern`) | Dashboard, At Work, Attendances, Extra Hours | Kiosk Mode, Reporting, Configuration |

`time_off_modern` / `attendance_modern` install by themselves when Modern Employees
and Odoo's Time Off / Attendances app are both installed (auto install).

Every list, kanban, calendar, activity, pivot and graph is Odoo's own view in the modern
page; forms are Odoo's own with the chatter. Each app has its accent colour (Employees blue,
Time Off violet, Attendances teal) on dashboards and graphs.

## Safe by design
- No new model, table or field: only methods on `hr.employee` that read with the user's rights.
- Page tags of older versions redirect to the new pages, so a database that is not
  upgraded yet never fails with "Cannot find key … in the actions registry".
- Pages show Odoo's own kanban / list / activity / graph / pivot / search views and open
  Odoo's own forms with the chatter, so Odoo updates and other HR modules keep working.
- Views are referenced by xml id with a fallback to the default view; each dashboard
  block is isolated, so a missing field or app skips that block instead of failing.

## Install
Update the Apps list, then install **Modern Employees** (it also installs Odoo's Employees).
